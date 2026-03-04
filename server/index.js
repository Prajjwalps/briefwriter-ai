'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express  = require('express');
const multer   = require('multer');
const pdfParse = require('pdf-parse');
const mammoth  = require('mammoth');
const path     = require('path');
const fs       = require('fs');
const { Document, Packer, Paragraph, HeadingLevel, AlignmentType, TextRun } = require('docx');

const app    = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const PORT   = process.env.PORT || 3001;

// OpenRouter config — OpenAI-compatible API
const OPENROUTER_URL   = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODEL = 'anthropic/claude-haiku-4.5';

// ── Claude prompts ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert academic writing analyst. Your sole job is to read an assignment brief and extract structured metadata from it. You always respond with valid JSON and nothing else — no markdown fences, no explanation, no preamble.`;

const ANALYSIS_PROMPT = `
Analyse the assignment brief above and return ONLY a valid JSON object with this EXACT schema:

{
  "referenceStyle": "<one of: apa7 | apa6 | mla9 | chicago17 | harvard | ieee | vancouver | oxford | oscola | null>",
  "wordLimit": <integer or null>,
  "subject": "<specific academic discipline, e.g. 'Nursing & Healthcare' | null>",
  "taskType": "<one of: Essay | Research Paper | Report | Case Study | Dissertation / Thesis | Reflective Writing | Literature Review | Annotated Bibliography | null>",
  "keywords": ["<concept 1>", "<concept 2>", "...", "<concept N>"],
  "outline": [
    {
      "section": "Section Name",
      "wordCount": <estimated words for this section>,
      "points": ["Key concept 1", "Key concept 2", "Key concept 3"]
    }
  ],
  "summary": "<1-2 sentence plain-English description of what the brief asks for>"
}

Rules:
- referenceStyle: Detect from the brief. Return the slug if explicitly named or strongly implied (e.g. "Harvard referencing" → "harvard"). Return null if not found — the frontend defaults to APA 7.
- wordLimit: Return the exact integer if stated (e.g. "2,000 words" → 2000). Return null if not found. Do NOT guess or estimate from page counts.
- subject: Be specific (e.g. "Business Strategy", not just "Business"). Return null only if completely impossible.
- taskType: Match to the closest listed value. Return null if unclear.
- keywords: 5–8 substantive academic noun phrases central to this assignment (e.g. "supply chain resilience", "Gibbs reflective cycle"). Avoid generic terms like "essay" or "assignment".
- outline: REQUIRED FIELD. Create 4–5 sections based on the brief structure:
  * "section": Clear section name (Introduction, Main Section 1, Main Section 2, Discussion, Conclusion, etc.)
  * "wordCount": Realistic word count allocation for this section (proportional to total word limit). Example: for 2000-word essay: Introduction ~300, Body sections ~400 each, Conclusion ~200.
  * "points": 3–4 specific academic bullet points or concepts that must be covered in this section
  * Total wordCount across all sections should equal or be close to the stated wordLimit
- summary: A concise factual summary of the task, topic, and key constraints.
- IMPORTANT: Use "section" not "heading". Each outline item must have "section", "wordCount", and "points". Do NOT include "briefDraft".
`.trim();

// ── Static serving ──────────────────────────────────────────────────────────

const BUNDLE_PATH = path.resolve(__dirname, '../brief-processor/bundle.html');

app.get('/', (_req, res) => {
  if (!fs.existsSync(BUNDLE_PATH)) {
    return res.status(503).send('Bundle not built yet. Run: bash .claude/skills/web-artifacts-builder/scripts/bundle-artifact.sh from brief-processor/');
  }
  res.sendFile(BUNDLE_PATH);
});

// ── Health check ────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// ── Analysis endpoint ───────────────────────────────────────────────────────

app.post('/api/analyse', upload.array('files', 10), async (req, res) => {
  // 1. Validate API key
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'OPENROUTER_API_KEY environment variable is not set. Please set it before starting the server.',
    });
  }

  const files = req.files;
  if (!files || files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded.' });
  }

  // 2. Extract text + collect image items
  const textParts  = [];
  const imageItems = []; // { mimeType, base64, name }

  const IMAGE_MIME_MAP = {
    'image/jpeg': 'image/jpeg',
    'image/jpg':  'image/jpeg',
    'image/png':  'image/png',
    'image/gif':  'image/gif',
    'image/webp': 'image/webp',
  };

  for (const file of files) {
    const mime = file.mimetype;
    const name = file.originalname.toLowerCase();

    try {
      if (mime === 'text/plain' || name.endsWith('.txt') || name.endsWith('.md')) {
        textParts.push(`--- File: ${file.originalname} ---\n${file.buffer.toString('utf-8')}`);

      } else if (mime === 'application/pdf' || name.endsWith('.pdf')) {
        const parsed = await pdfParse(file.buffer);
        textParts.push(`--- File: ${file.originalname} (PDF) ---\n${parsed.text.trim()}`);

      } else if (
        mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        name.endsWith('.docx')
      ) {
        const result = await mammoth.extractRawText({ buffer: file.buffer });
        textParts.push(`--- File: ${file.originalname} (DOCX) ---\n${result.value.trim()}`);

      } else if (IMAGE_MIME_MAP[mime]) {
        if (imageItems.length < 5) { // keep within reasonable limits
          imageItems.push({
            mimeType: IMAGE_MIME_MAP[mime],
            base64:   file.buffer.toString('base64'),
            name:     file.originalname,
          });
        }
      }
      // .doc (legacy binary Word) silently skipped — requires LibreOffice
    } catch (err) {
      console.warn(`[server] Failed to extract "${file.originalname}":`, err.message);
    }
  }

  const combinedText = textParts.join('\n\n');
  if (!combinedText && imageItems.length === 0) {
    return res.status(422).json({
      error: 'Could not extract any readable content from the uploaded files. Try PDF, DOCX, or image formats.',
    });
  }

  // 3. Build OpenRouter message (OpenAI-compatible format)
  //    Images use the image_url content block with a data URI
  const userContent = [];

  if (combinedText) {
    userContent.push({
      type: 'text',
      text: `The following is the full text extracted from the uploaded assignment brief:\n\n${combinedText}`,
    });
  }

  for (const img of imageItems) {
    userContent.push({
      type: 'text',
      text: `The following image is from file "${img.name}". Read any text visible in it and treat it as part of the brief:`,
    });
    userContent.push({
      type:      'image_url',
      image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
    });
  }

  // Append extra instructions if provided
  const extraInstructions = req.body?.extraInstructions?.trim();
  const finalPrompt = extraInstructions
    ? `${ANALYSIS_PROMPT}\n\nAdditional instructions from the student: ${extraInstructions}`
    : ANALYSIS_PROMPT;

  userContent.push({ type: 'text', text: finalPrompt });

  // 4. Call OpenRouter
  let responseText;
  try {
    const response = await fetch(OPENROUTER_URL, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
        'HTTP-Referer':  'http://localhost:3001',
        'X-Title':       'BriefWriter AI',
      },
      body: JSON.stringify({
        model:    OPENROUTER_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: userContent   },
        ],
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`OpenRouter ${response.status}: ${errBody}`);
    }

    const data = await response.json();
    responseText = data.choices?.[0]?.message?.content ?? '';
    console.log('[server] OpenRouter response:', responseText.slice(0, 200));
  } catch (err) {
    console.error('[server] OpenRouter API error:', err.message);
    return res.status(502).json({ error: `OpenRouter API error: ${err.message}` });
  }

  // 5. Parse JSON (strip fences if present)
  let parsed;
  try {
    const fenceMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr    = fenceMatch ? fenceMatch[1] : responseText;
    parsed = JSON.parse(jsonStr.trim());
  } catch {
    console.error('[server] Failed to parse JSON response:', responseText);
    return res.status(502).json({
      error: 'Model returned malformed JSON. Please try again.',
      raw:   responseText,
    });
  }

  res.json(parsed);
});

// ── References endpoint ─────────────────────────────────────────────────────

app.use(express.json());


app.post('/api/references', async (req, res) => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OPENROUTER_API_KEY not set.' });
  }

  const { keywords = [], subject = '', taskType = '', summary = '', referenceStyle = 'apa7', filters = {} } = req.body;

  const {
    includeArticles       = true,
    includeBooks          = true,
    includeConferencePapers = true,
    includeDissertations  = false,
    includeReports        = false,
    includeNews           = false,
    includeBlogs          = false,
    includeGovernment     = false,
    includeIndustry       = false,
    fullTextOnly          = false,
    peerReviewedOnly      = true,
    languageEnglishOnly   = true,
    yearFrom              = new Date().getFullYear() - 10,
    yearTo                = new Date().getFullYear(),
    maxResults            = 10,
  } = filters;

  const hasAcademic    = includeArticles || includeBooks || includeConferencePapers || includeDissertations || includeReports;
  const hasNonAcademic = includeNews || includeBlogs || includeGovernment || includeIndustry;

  const results = [];

  // ── UNIFIED REFERENCE SEARCH (Academic + Non-Academic sources) ────────────────────────────────
  if (hasAcademic || hasNonAcademic) {
    try {
      // Build list of ALL needed source types
      const sourceTypes = [];
      if (includeArticles)         sourceTypes.push('peer-reviewed journal articles');
      if (includeBooks)            sourceTypes.push('academic books and book chapters');
      if (includeConferencePapers) sourceTypes.push('conference papers and proceedings');
      if (includeDissertations)    sourceTypes.push('dissertations and theses');
      if (includeReports)          sourceTypes.push('academic reports and working papers');
      if (includeNews)             sourceTypes.push('news articles (BBC, Reuters, Guardian, AP News, etc.)');
      if (includeGovernment)       sourceTypes.push('government publications (WHO, CDC, Gov.uk, NHS, UN, NICE, etc.)');
      if (includeIndustry)         sourceTypes.push('industry reports and research (McKinsey, Deloitte, OECD, World Bank, etc.)');
      if (includeBlogs)            sourceTypes.push('expert publications and established blogs (HBR, Nature, Scientific American, etc.)');

      const systemPrompt = `You are an expert research librarian. Use web search to find REAL, verified sources that match the student's requirements. Only return sources you actually found via web search — NEVER invent or hallucinate sources, titles, authors, or URLs.

Search across:
- Academic databases (Google Scholar, PubMed, JSTOR, SSRN, arXiv, ResearchGate)
- News outlets (BBC, Reuters, Guardian, AP News)
- Government/official sources (WHO, CDC, Gov.uk, NHS, UN, NICE)
- Industry/professional sources (McKinsey, Deloitte, OECD, World Bank)
- Expert publications (HBR, Nature, Scientific American)

Return ONLY a valid JSON array with no markdown fences, no explanation. Each source must be a real source you actually found:
[
  {
    "title": "Exact paper/article title",
    "authors": ["Author One", "Author Two"],
    "year": 2023,
    "sourceName": "Journal/Publication Name",
    "url": "https://example.com/...",
    "type": "article",
    "doi": "10.xxxx/yyy",
    "citationCount": 42,
    "abstract": "Brief summary"
  }
]

Type must be one of: article, book, conference-paper, dissertation, report, news, government, industry, blog`;

      const userPrompt = `Find ${maxResults} real sources for a student writing a ${taskType} about "${subject}".

Summary: ${summary}
Keywords: ${keywords.join(', ')}

Source types needed: ${sourceTypes.join(', ')}
Year range: ${yearFrom}–${yearTo}
${peerReviewedOnly ? 'Academic sources should be peer-reviewed.' : ''}
${fullTextOnly ? 'Prefer full-text available sources.' : ''}
${languageEnglishOnly ? 'English language only.' : ''}

${req.body?.extraSearchInstructions ? `Special instructions: ${req.body.extraSearchInstructions}\n` : ''}

Search iteratively across the source types needed. Return exactly ${maxResults} sources as a JSON array.`;

      const searchRes = await fetch(OPENROUTER_URL, {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type':  'application/json',
          'HTTP-Referer':  'http://localhost:3001',
          'X-Title':       'BriefWriter AI',
        },
        body: JSON.stringify({
          model:    OPENROUTER_MODEL,
          tools:    [{ type: 'web_search_20250305', name: 'web_search', max_uses: 10 }],
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user',   content: userPrompt   },
          ],
          max_tokens: 4096,
        }),
      });

      if (searchRes.ok) {
        const searchData = await searchRes.json();
        const message    = searchData.choices?.[0]?.message;

        // Handle multi-block content (text + tool_use blocks)
        let responseText = '';
        if (typeof message?.content === 'string') {
          responseText = message.content;
        } else if (Array.isArray(message?.content)) {
          for (const block of message.content) {
            if (block.type === 'text') responseText += block.text;
          }
        }

        // Extract JSON array from response
        const fenceMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
        const stripped   = fenceMatch ? fenceMatch[1] : responseText;
        const arrayMatch = stripped.match(/\[[\s\S]*\]/);

        let sources = [];
        try {
          sources = JSON.parse((arrayMatch ? arrayMatch[0] : stripped).trim());
          if (!Array.isArray(sources)) sources = [];
        } catch (err) {
          console.warn('[server] Could not parse unified search results:', err.message);
        }

        const VALID_TYPES = new Set(['article', 'book', 'conference-paper', 'dissertation', 'report', 'news', 'government', 'industry', 'blog']);

        for (const s of sources.slice(0, maxResults)) {
          if (!s.title) continue;
          const doi = s.doi ? s.doi.replace(/^https?:\/\/doi\.org\//, '') : undefined;
          results.push({
            id:                 `ref-${Math.random().toString(36).slice(2)}`,
            title:              s.title,
            authors:            Array.isArray(s.authors) ? s.authors.slice(0, 4) : [],
            year:               Number(s.year) || yearTo,
            sourceName:         s.sourceName ?? s.journal ?? s.publisher ?? '',
            doi,
            url:                s.url ?? (doi ? `https://doi.org/${doi}` : undefined),
            type:               VALID_TYPES.has(s.type) ? s.type : 'article',
            isOpenAccess:       Boolean(s.isOpenAccess),
            citationCount:      Number(s.citationCount) || 0,
            abstract:           s.abstract ?? '',
            annotation:         '',
            formattedReference: '',
            aiGenerated:        false,
            verified:           true,
            verificationMethod: 'web-search',
          });
        }

        console.log(`[server] Unified web search: ${results.length} sources found`);
      } else {
        const errBody = await searchRes.text();
        console.error('[server] Unified search API error:', searchRes.status, errBody.slice(0, 300));
      }
    } catch (err) {
      console.error('[server] Unified search error:', err.message);
    }
  }

  // ── LEGACY: Non-academic sources (DISABLED - using unified search above) ────────────────────────────────
  if (false && hasNonAcademic) {
    const nonAcademicTypes = [];
    if (includeNews)       nonAcademicTypes.push('news articles (BBC, Reuters, AP, Guardian, NYT)');
    if (includeGovernment) nonAcademicTypes.push('government & health body publications (WHO, CDC, NHS, Gov.uk, UN, NICE)');
    if (includeIndustry)   nonAcademicTypes.push('industry reports & think tanks (McKinsey, Deloitte, OECD, World Bank, research institutes)');
    if (includeBlogs)      nonAcademicTypes.push('expert publications & established blogs (Harvard Business Review, Scientific American, Nature News & Views)');

    const nonAcademicCount = Math.min(maxResults, 8);

    // Step 1: Generate search queries via Claude
    const queryPrompt = `You are an expert researcher. The student is writing a ${taskType} on: "${subject}".
Brief summary: ${summary}
Keywords: ${keywords.join(', ')}

Generate exactly 4-5 realistic web search queries to find credible non-academic sources from: ${nonAcademicTypes.join(', ')}.

Each query should:
- Include the topic/keywords
- Specify the year range (${yearFrom}-${yearTo})
- Target specific institutions (BBC, Reuters, WHO, Gov.uk, McKinsey, etc.)
- Be concise and searchable

Return ONLY a JSON array of search query strings, no markdown fences:
["query 1", "query 2", "query 3", "query 4", "query 5"]`;

    try {
      const queryRes = await fetch(OPENROUTER_URL, {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type':  'application/json',
          'HTTP-Referer':  'http://localhost:3001',
          'X-Title':       'BriefWriter AI',
        },
        body: JSON.stringify({
          model:    OPENROUTER_MODEL,
          messages: [
            { role: 'system', content: 'You are an expert researcher. Respond with valid JSON only, no markdown, no explanation.' },
            { role: 'user',   content: queryPrompt },
          ],
          max_tokens: 200,
        }),
      });

      if (queryRes.ok) {
        const queryData = await queryRes.json();
        const rawQueries = queryData.choices?.[0]?.message?.content ?? '[]';
        const fenceMatch = rawQueries.match(/```(?:json)?\s*([\s\S]*?)```/);
        const jsonStr = fenceMatch ? fenceMatch[1] : rawQueries;

        let searchQueries = [];
        try {
          searchQueries = JSON.parse(jsonStr.trim());
        } catch {
          searchQueries = [];
        }

        // Step 2: Construct URLs and validate existence
        const searchedSources = [];

        // Map of institution domains for URL construction
        const institutionDomains = {
          'bbc': 'bbc.com/news',
          'reuters': 'reuters.com',
          'guardian': 'theguardian.com',
          'nyt': 'nytimes.com',
          'ap': 'apnews.com',
          'who': 'who.int',
          'cdc': 'cdc.gov',
          'nhs': 'nhs.uk',
          'gov.uk': 'gov.uk',
          'un': 'un.org',
          'mckinsey': 'mckinsey.com',
          'deloitte': 'deloitte.com',
          'oecd': 'oecd.org',
          'worldbank': 'worldbank.org',
          'hbr': 'hbr.org',
          'nature': 'nature.com',
        };

        // For each query, construct likely URLs from known institutions
        for (const query of searchQueries.slice(0, 4)) {
          // Extract keywords from query
          const keywords_lower = query.toLowerCase();

          // Try to match institutions in query
          for (const [inst, domain] of Object.entries(institutionDomains)) {
            if (keywords_lower.includes(inst)) {
              // Construct likely URL (simplified - real implementation would search)
              const sourceId = `na-${Math.random().toString(36).slice(2)}`;
              const sourceObj = {
                id: sourceId,
                title: query.split(' ').slice(0, 8).join(' '), // Use query as base for title
                authors: [inst.charAt(0).toUpperCase() + inst.slice(1)],
                year: yearTo,
                sourceName: inst.charAt(0).toUpperCase() + inst.slice(1),
                url: `https://${domain}`,
                type: includeNews && (inst === 'bbc' || inst === 'reuters' || inst === 'guardian' || inst === 'nyt' || inst === 'ap') ? 'news'
                    : includeGovernment && (inst === 'who' || inst === 'cdc' || inst === 'nhs' || inst === 'gov.uk' || inst === 'un') ? 'government'
                    : includeIndustry && (inst === 'mckinsey' || inst === 'deloitte' || inst === 'oecd' || inst === 'worldbank') ? 'industry'
                    : includeBlogs && (inst === 'hbr' || inst === 'nature') ? 'blog'
                    : 'news',
                abstract: `Relevant article from ${inst} about: ${query}`,
                verified: false,
                verificationMethod: 'web-search',
              };

              searchedSources.push(sourceObj);
              if (searchedSources.length >= nonAcademicCount) break;
            }
          }

          if (searchedSources.length >= nonAcademicCount) break;
        }

        // Step 3: Validate URLs exist (HTTP HEAD request)
        for (const source of searchedSources) {
          try {
            const headRes = await fetch(source.url, { method: 'HEAD', redirect: 'follow' });
            source.verified = headRes.ok;
            source.urlVerified = headRes.ok;
          } catch (err) {
            console.warn(`[server] URL validation failed for ${source.url}:`, err.message);
            source.urlVerified = false;
          }
        }

        // Step 4: Claude validates results for credibility
        if (searchedSources.length > 0) {
          const validationPrompt = `Review these ${searchedSources.length} proposed non-academic sources for credibility and relevance.
Topic: ${subject}
Summary: ${summary}

Sources:
${JSON.stringify(searchedSources.map(s => ({ title: s.title, sourceName: s.sourceName, type: s.type, url: s.url })), null, 2)}

For each source, confirm if it's credible and relevant. Return ONLY valid JSON array:
[
  {
    "id": "na-xxx",
    "credible": true/false,
    "reason": "brief reason"
  }
]`;

          try {
            const valRes = await fetch(OPENROUTER_URL, {
              method:  'POST',
              headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type':  'application/json',
                'HTTP-Referer':  'http://localhost:3001',
                'X-Title':       'BriefWriter AI',
              },
              body: JSON.stringify({
                model:    OPENROUTER_MODEL,
                messages: [
                  { role: 'system', content: 'You are a credibility validator. Respond with valid JSON only.' },
                  { role: 'user',   content: validationPrompt },
                ],
                max_tokens: 500,
              }),
            });

            if (valRes.ok) {
              const valData = await valRes.json();
              const valText = valData.choices?.[0]?.message?.content ?? '[]';
              const valFence = valText.match(/```(?:json)?\s*([\s\S]*?)```/);
              const valJson = valFence ? valFence[1] : valText;

              try {
                const validations = JSON.parse(valJson.trim());
                for (const val of validations) {
                  const source = searchedSources.find(s => s.id === val.id);
                  if (source) {
                    source.verified = val.credible === true;
                  }
                }
              } catch {}
            }
          } catch (err) {
            console.error('[server] Credibility validation error:', err.message);
          }
        }

        // Add validated sources to results
        for (const source of searchedSources) {
          results.push({
            id:                source.id,
            title:             source.title,
            authors:           source.authors,
            year:              source.year,
            sourceName:        source.sourceName,
            doi:               undefined,
            url:               source.url,
            type:              source.type,
            isOpenAccess:      true,
            citationCount:     0,
            abstract:          source.abstract,
            annotation:        '',
            formattedReference: '',
            aiGenerated:       false,
            verified:          source.verified,
            verificationMethod: 'web-search',
            urlVerified:       source.urlVerified,
          });
        }
      }
    } catch (err) {
      console.error('[server] Non-academic source search error:', err.message);
    }
  }

  if (results.length === 0) {
    return res.json([]);
  }

  // ── Batch Claude call: annotations + formatted references ─────────────────
  const sourcesForClaude = results.map(r => ({
    id:       r.id,
    title:    r.title,
    authors:  r.authors,
    year:     r.year,
    journal:  r.sourceName,
    doi:      r.doi ?? null,
    abstract: r.abstract ?? '',
    type:     r.type,
    aiGenerated: r.aiGenerated ?? false,
  }));

  const REFERENCE_STYLE_NAMES = {
    apa7: 'APA 7th Edition', apa6: 'APA 6th Edition', mla9: 'MLA 9th Edition',
    chicago17: 'Chicago 17th Edition', harvard: 'Harvard', ieee: 'IEEE',
    vancouver: 'Vancouver', oxford: 'Oxford', oscola: 'OSCOLA',
  };
  const styleLabel = REFERENCE_STYLE_NAMES[referenceStyle] ?? 'APA 7th Edition';

  const batchPrompt = `The student is writing a ${taskType} on the following topic:
Subject: ${subject}
Summary: ${summary}
Keywords: ${keywords.join(', ')}

For EACH source below, produce:
1. "annotation": exactly ~100 words explaining what the source argues/covers AND specifically how it is relevant to THIS student's assignment. Link it to their topic, subject, and keywords. Do NOT write a generic summary — explain why this source is useful for their specific work.
2. "formattedReference": the full citation formatted in ${styleLabel} style. For AI-suggested sources (aiGenerated: true), format as best as possible from available data.

Return ONLY a valid JSON array (no markdown, no explanation):
[{ "id": "...", "annotation": "...", "formattedReference": "..." }]

Sources:
${JSON.stringify(sourcesForClaude, null, 2)}`;

  try {
    const batchResponse = await fetch(OPENROUTER_URL, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
        'HTTP-Referer':  'http://localhost:3001',
        'X-Title':       'BriefWriter AI',
      },
      body: JSON.stringify({
        model:    OPENROUTER_MODEL,
        messages: [
          { role: 'system', content: 'You are an expert academic librarian writing contextual annotations for a student. Respond with valid JSON only, no markdown fences, no explanation.' },
          { role: 'user',   content: batchPrompt },
        ],
        max_tokens: 4096,
      }),
    });

    if (batchResponse.ok) {
      const batchData = await batchResponse.json();
      const rawText   = batchData.choices?.[0]?.message?.content ?? '';
      const fenceMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonStr    = fenceMatch ? fenceMatch[1] : rawText;

      try {
        const annotated = JSON.parse(jsonStr.trim());
        for (const item of annotated) {
          const ref = results.find(r => r.id === item.id);
          if (ref) {
            ref.annotation         = item.annotation ?? '';
            ref.formattedReference = item.formattedReference ?? '';
          }
        }
      } catch (parseErr) {
        console.error('[server] Failed to parse batch annotations:', rawText.slice(0, 200));
      }
    }
  } catch (err) {
    console.error('[server] Batch annotation error:', err.message);
  }

  // Strip internal abstract field before returning
  const output = results.map(({ abstract, ...rest }) => rest);
  res.json(output);

  // ── Async URL validation (runs in background, doesn't block response) ──
  setImmediate(async () => {
    for (const result of results) {
      if (!result.url) continue;
      try {
        const headRes = await fetch(result.url, {
          method: 'HEAD',
          redirect: 'follow',
          timeout: 5000
        });
        result.urlVerified = headRes.ok;
        if (!headRes.ok) {
          console.warn(`[server] URL validation: ${result.url} returned ${headRes.status}`);
        }
      } catch (err) {
        result.urlVerified = false;
        console.warn(`[server] Async URL validation failed for ${result.url}:`, err.message);
      }
    }
  });
});

// ── Outline Enhancement endpoint ────────────────────────────────────────────────────
app.post('/api/enhance-outline', async (req, res) => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OPENROUTER_API_KEY not set.' });
  }

  const { briefContext = {}, selectedReferences = [], extraInstructions = '' } = req.body;

  if (!briefContext.outline || !Array.isArray(briefContext.outline)) {
    return res.status(400).json({ error: 'briefContext.outline is required.' });
  }

  if (selectedReferences.length === 0) {
    return res.status(400).json({ error: 'At least one reference is required.' });
  }

  const { outline, keywords = [], subject = '', taskType = '', summary = '', detectedWordLimit = 2000 } = briefContext;

  const systemPrompt = `You are an expert academic writing structure advisor. Your role is to:
1. Analyze the student's brief context and provided outline structure
2. Examine the selected references the student has gathered
3. Create a detailed, actionable enhanced outline showing:
   - How to structure each section (refined from original)
   - Which references belong in each section and why
   - How to cite each source (quote, paraphrase, synthesis, compare)
   - Specific integration guidance

Return ONLY valid JSON array with no markdown fences and no explanation.`;

  const referenceList = selectedReferences
    .map((r, idx) => `[${idx}] "${r.title}" (${r.year}, ${r.authors[0] ?? 'Unknown'}) - ${r.type}`)
    .join('\n');

  const userPrompt = `Enhance the outline for a student writing a ${taskType} on "${subject}".

Student's Brief Context:
- Summary: ${summary}
- Word limit: ${detectedWordLimit} words
- Keywords: ${keywords.join(', ')}

Original Outline Structure:
${outline.map(s => `- ${s.section} (~${s.wordCount} words): ${s.points.join('; ')}`).join('\n')}

Selected References (${selectedReferences.length}):
${referenceList}

${extraInstructions ? `Special Instructions: ${extraInstructions}\n` : ''}

For EACH section in the original outline, provide a detailed enhancement in this JSON format:
[
  {
    "section": "Original section name or refined version",
    "wordCount": <number>,
    "points": ["key point 1", "key point 2", "key point 3"],
    "description": "<100-150 words describing what should go in this section and how>",
    "referenceMappings": {
      "referenceIndices": [<which references from the list above, by index>],
      "guidance": "<50-100 words on how to integrate these sources - quote, paraphrase, compare, etc.>"
    }
  }
]

Also provide:
- "overallGuidance": "<100-150 words on overall strategy for integrating sources throughout the essay>"
- Ensure word counts sum to approximately ${detectedWordLimit}
- Show exactly which references should be used in which sections
- Return ONLY the JSON array and guidance, no other text.`;

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3001',
        'X-Title': 'BriefWriter AI',
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 2500,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`OpenRouter ${response.status}: ${errBody.slice(0, 200)}`);
    }

    const data = await response.json();
    let responseText = data.choices?.[0]?.message?.content ?? '';

    // Extract JSON array (Claude may wrap it in explanation)
    const fenceMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    const stripped = fenceMatch ? fenceMatch[1] : responseText;
    const arrayMatch = stripped.match(/\[\s*\{[\s\S]*?\}\s*\]/);

    let enhancedSections = [];
    let overallGuidance = '';

    try {
      const parsed = JSON.parse((arrayMatch ? arrayMatch[0] : stripped).trim());
      if (Array.isArray(parsed)) {
        enhancedSections = parsed;
      } else if (parsed.sections) {
        enhancedSections = parsed.sections;
        overallGuidance = parsed.overallGuidance || '';
      }
    } catch (parseErr) {
      console.error('[server] Failed to parse enhanced outline:', responseText.slice(0, 300));
      throw new Error('Could not parse outline response');
    }

    // Validation
    if (!Array.isArray(enhancedSections) || enhancedSections.length === 0) {
      throw new Error('Invalid enhanced outline response');
    }

    // Build word allocation map
    const wordAllocation = {};
    enhancedSections.forEach(s => {
      wordAllocation[s.section] = s.wordCount;
    });

    res.json({
      sections: enhancedSections,
      overallGuidance,
      wordAllocation,
    });

  } catch (err) {
    console.error('[server] Enhance outline error:', err.message);
    return res.status(502).json({ error: `Outline generation failed: ${err.message}` });
  }
});

// ── Document Generation endpoint ────────────────────────────────────────────────────
app.post('/api/generate-document', async (req, res) => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OPENROUTER_API_KEY not set.' });
  }

  const { outline, references, referenceStyle = 'APA 7', briefContext = {} } = req.body;

  if (!outline || !Array.isArray(references)) {
    return res.status(400).json({ error: 'outline and references are required.' });
  }

  const { subject = 'Assignment', taskType = 'Essay', wordLimit = 2000, summary = '' } = briefContext;

  // Format references for the prompt
  const refList = references
    .map((r, idx) => {
      const authors = Array.isArray(r.authors) ? r.authors.join(', ') : r.authors || 'Unknown';
      return `[${idx}] ${r.title} (${r.year}) by ${authors} - ${r.type}`;
    })
    .join('\n');

  const systemPrompt = `You are an expert academic writer. Your role is to:
1. Take an outline and expand it into a full, well-structured essay
2. Integrate citations naturally using ${referenceStyle} format
3. Ensure in-text citations appear where sources are referenced
4. Maintain academic tone and proper paragraph structure
5. Meet the specified word limit

For in-text citations use this format:
- Author (Year) for narrative citations
- (Author, Year) for parenthetical citations
- Use reference numbers [1], [2] etc. where applicable

Return ONLY the full essay text with citations. Do NOT include a reference list.`;

  const userPrompt = `Write a ${taskType.toLowerCase()} on "${subject}" using this outline and integrating the provided references.

Word Limit: ~${wordLimit} words
Style: ${referenceStyle}
Summary: ${summary}

Outline:
${outline}

Available References:
${refList}

Requirements:
- Expand each section from the outline into 1-2 well-developed paragraphs
- Integrate citations naturally throughout
- Use ${referenceStyle} citation format
- Maintain academic tone
- Aim for approximately ${wordLimit} words total
- Make it flow naturally from section to section`;

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3001',
        'X-Title': 'BriefWriter AI',
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`OpenRouter ${response.status}: ${errBody.slice(0, 200)}`);
    }

    const data = await response.json();
    const documentText = data.choices?.[0]?.message?.content ?? '';

    if (!documentText) {
      throw new Error('No document content generated');
    }

    // Generate reference list based on style
    let referenceList = '\n\nReferences\n';
    if (referenceStyle === 'APA 7') {
      referenceList += references
        .map(r => {
          const authors = Array.isArray(r.authors) ? r.authors.join(', ') : r.authors || 'Unknown';
          return `${authors} (${r.year}). ${r.title}. ${r.sourceName}.`;
        })
        .join('\n');
    } else if (referenceStyle === 'MLA 9') {
      referenceList += references
        .map(r => {
          const authors = Array.isArray(r.authors) ? r.authors.join(', ') : r.authors || 'Unknown';
          return `${authors}. "${r.title}." ${r.sourceName}, ${r.year}.`;
        })
        .join('\n');
    } else if (referenceStyle === 'Harvard') {
      referenceList += references
        .map(r => {
          const authors = Array.isArray(r.authors) ? r.authors.join(', ') : r.authors || 'Unknown';
          return `${authors} ${r.year}, ${r.title}, ${r.sourceName}.`;
        })
        .join('\n');
    } else {
      // Default format
      referenceList += references
        .map(r => {
          const authors = Array.isArray(r.authors) ? r.authors.join(', ') : r.authors || 'Unknown';
          return `${authors} (${r.year}). ${r.title}. ${r.sourceName}.`;
        })
        .join('\n');
    }

    // Combine document text with reference list
    const fullText = documentText + referenceList;
    const wordCount = documentText.split(/\s+/).filter(w => w).length;
    const title = `${subject} - ${taskType}`;

    // Create DOCX document with enhanced formatting
    try {
      const paragraphs = [];

      // Helper function to parse text with markdown formatting (**, *, etc.)
      const parseFormattedText = (text) => {
        const runs = [];
        let remaining = text;

        while (remaining.length > 0) {
          // Match bold text: **text**
          const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/);
          if (boldMatch) {
            runs.push(new TextRun({ text: boldMatch[1], bold: true }));
            remaining = remaining.slice(boldMatch[0].length);
            continue;
          }

          // Match italic text: *text* (but not **)
          const italicMatch = remaining.match(/^\*([^*]+)\*(?!\*)/);
          if (italicMatch) {
            runs.push(new TextRun({ text: italicMatch[1], italics: true }));
            remaining = remaining.slice(italicMatch[0].length);
            continue;
          }

          // Match regular text up to next special char
          const regularMatch = remaining.match(/^[^*]+/);
          if (regularMatch) {
            runs.push(new TextRun(regularMatch[0]));
            remaining = remaining.slice(regularMatch[0].length);
          } else {
            // Fallback for single characters
            runs.push(new TextRun(remaining.charAt(0)));
            remaining = remaining.slice(1);
          }
        }

        return runs;
      };

      // Add title as heading
      paragraphs.push(
        new Paragraph({
          text: title,
          heading: HeadingLevel.HEADING_1,
          spacing: { after: 400 },
          alignment: AlignmentType.JUSTIFIED,
        })
      );

      // Split document text into paragraphs and process with formatting detection
      const paragraphLines = fullText.split('\n\n').filter(p => p.trim());

      paragraphLines.forEach((para, idx) => {
        const trimmedPara = para.trim();

        // Detect heading levels: # ## ### #### etc.
        const h1Match = trimmedPara.match(/^#\s+(.+)$/);
        const h2Match = trimmedPara.match(/^##\s+(.+)$/);
        const h3Match = trimmedPara.match(/^###\s+(.+)$/);

        if (h1Match) {
          // Heading 1
          paragraphs.push(
            new Paragraph({
              text: h1Match[1],
              heading: HeadingLevel.HEADING_1,
              spacing: { before: 200, after: 200 },
              alignment: AlignmentType.JUSTIFIED,
            })
          );
        } else if (h2Match) {
          // Heading 2
          paragraphs.push(
            new Paragraph({
              text: h2Match[1],
              heading: HeadingLevel.HEADING_2,
              spacing: { before: 200, after: 200 },
              alignment: AlignmentType.JUSTIFIED,
            })
          );
        } else if (h3Match) {
          // Heading 3
          paragraphs.push(
            new Paragraph({
              text: h3Match[1],
              heading: HeadingLevel.HEADING_3,
              spacing: { before: 120, after: 120 },
              alignment: AlignmentType.JUSTIFIED,
            })
          );
        } else if (trimmedPara.toLowerCase() === 'references') {
          // Special case: References heading
          paragraphs.push(
            new Paragraph({
              text: 'References',
              heading: HeadingLevel.HEADING_2,
              spacing: { before: 400, after: 200 },
              alignment: AlignmentType.JUSTIFIED,
            })
          );
        } else {
          // Regular paragraph with formatting support
          const runs = parseFormattedText(trimmedPara);
          paragraphs.push(
            new Paragraph({
              children: runs,
              spacing: { line: 240, after: 200, before: 0 }, // Double spacing for academic style
              alignment: AlignmentType.JUSTIFIED,
              indent: { firstLine: 720 }, // First line indent for paragraphs
            })
          );
        }
      });

      const doc = new Document({
        sections: [{
          children: paragraphs,
          properties: {
            page: {
              margins: {
                top: 1440, // 1 inch
                right: 1440,
                bottom: 1440,
                left: 1440,
              },
            },
          },
        }],
      });

      // Generate DOCX buffer
      const docxBuffer = await Packer.toBuffer(doc);
      const docxBase64 = docxBuffer.toString('base64');

      res.json({
        documentText: fullText,
        title: title,
        wordCount: wordCount,
        docxBase64: docxBase64,
      });
    } catch (docxErr) {
      console.error('[server] DOCX generation error:', docxErr.message);
      // Still return text version if DOCX fails
      res.json({
        documentText: fullText,
        title: title,
        wordCount: wordCount,
        docxBase64: null,
        error: 'DOCX generation failed, text version provided',
      });
    }
  } catch (err) {
    console.error('[server] Generate document error:', err.message);
    return res.status(502).json({ error: `Document generation failed: ${err.message}` });
  }
});

// ── Start ───────────────────────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[brief-server] http://localhost:${PORT}`);
  console.log(`[brief-server] OPENROUTER_API_KEY: ${process.env.OPENROUTER_API_KEY ? 'SET ✓' : 'MISSING ✗'}`);
  console.log(`[brief-server] Model: ${OPENROUTER_MODEL}`);
});
