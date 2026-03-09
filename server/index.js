'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express  = require('express');
const multer   = require('multer');
const pdfParse = require('pdf-parse');
const mammoth  = require('mammoth');
const path     = require('path');
const fs       = require('fs');
const { Document, Packer, Paragraph, HeadingLevel, AlignmentType, TextRun } = require('docx');
const pptxgen  = require('pptxgenjs');

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
  "numSlides": <integer or null>,
  "subject": "<specific academic discipline, e.g. 'Nursing & Healthcare' | null>",
  "taskType": "<one of: Essay | Research Paper | Report | Case Study | Dissertation / Thesis | Reflective Writing | Literature Review | Annotated Bibliography | Presentation | null>",
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
- numSlides: If the brief asks for a presentation, return the number of slides if stated (e.g. "10 slides" → 10). Return null if not found or not a presentation task.
- subject: Be specific (e.g. "Business Strategy", not just "Business"). Return null only if completely impossible.
- taskType: Match to the closest listed value. Use "Presentation" if the brief asks for slides/PowerPoint/presentation. Return null if unclear.
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

  const { briefContext = {}, selectedReferences = [], extraInstructions = '', currentOutlineText = '', tone = 'Academic' } = req.body;

  if (!briefContext.outline || !Array.isArray(briefContext.outline)) {
    return res.status(400).json({ error: 'briefContext.outline is required.' });
  }

  if (selectedReferences.length === 0) {
    return res.status(400).json({ error: 'At least one reference is required.' });
  }

  const { outline, keywords = [], subject = '', taskType = '', summary = '', detectedWordLimit = 2000 } = briefContext;

  const systemPrompt = `You are an academic outline specialist. Generate a structured outline in plain text — no JSON, no markdown fences.

Use EXACTLY this format for every section (three lines per section, blank line between sections):

1. Section Name (~X words)
   1–2 sentence description of what this section covers and argues, specific to the topic.
   Cite: Author Surname (Year); Author2 Surname (Year2)

Rules:
- The first line of every section MUST follow the pattern: number. Name (~X words)
- The second line (description) must be 1–2 concise sentences — no bullet points, no sub-headings
- The third line (Cite) lists only references from the provided reference list that belong in that section; use "Author Surname (Year)" format; separate multiple with " ; "
- Total outline length: approximately 300 words
- Word counts must sum to the stated word limit
- Writing Tone: ${tone}`;

  // Build reference list for the AI to assign to sections
  const referenceList = selectedReferences
    .map((r, idx) => `[${idx + 1}] ${r.authors[0]?.split(',')[0] ?? 'Unknown'} (${r.year}) — "${r.title.slice(0, 80)}"`)
    .join('\n');

  // Build the base outline representation — prefer the user's edited text
  const outlineBase = currentOutlineText.trim()
    ? `Current Outline (user's edited version — preserve structure, enrich descriptions and citations):\n${currentOutlineText}`
    : `Suggested Section Structure:\n${outline.map(s => `- ${s.section} (~${s.wordCount} words): ${s.points && s.points.length > 0 ? s.points.join('; ') : 'No points'}`).join('\n')}`;

  const userPrompt = `${extraInstructions.trim() ? `⚠️ MANDATORY USER REQUIREMENTS — follow these exactly, they override everything else:
${extraInstructions.trim()}

` : ''}Generate a structured outline for the ${taskType} on "${subject}".

${outlineBase}

Available References (assign relevant ones to each section):
${referenceList}

Assignment Context:
- Total word limit: ${detectedWordLimit} words
- Keywords: ${keywords.join(', ')}
- Reference style: ${briefContext.detectedReferenceStyle || 'apa7'}

Output a plain-text outline (~300 words total) with EVERY section showing:
  Line 1: number. Section Name (~X words)
  Line 2: 1–2 sentence description specific to this ${taskType}
  Line 3: Cite: [relevant references in Author Surname (Year) format]

Distribute ${detectedWordLimit} words proportionally. Return ONLY the outline, nothing else.`;

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
        max_tokens: 3000,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`OpenRouter ${response.status}: ${errBody.slice(0, 200)}`);
    }

    const data = await response.json();
    let responseText = data.choices?.[0]?.message?.content ?? '';

    // Parse plain text outline
    const outlineText = responseText.trim();

    // Extract sections and word counts using regex: "1. Section Name (~X words)"
    const sectionRegex = /^[\d]+\.\s+(.+?)\s*\(~?(\d+)\s*words?\)/gm;
    const wordAllocation = {};
    let match;
    const sections = [];

    while ((match = sectionRegex.exec(outlineText)) !== null) {
      const sectionName = match[1].trim();
      const wordCount = parseInt(match[2], 10);
      sections.push(sectionName);
      wordAllocation[sectionName] = wordCount;
    }

    // Validation
    if (sections.length === 0) {
      console.error('[server] No sections parsed from outline:', outlineText.slice(0, 200));
      throw new Error('Could not parse outline sections from response');
    }

    // Return condensed response format
    res.json({
      outline: outlineText,
      wordAllocation,
    });

  } catch (err) {
    console.error('[server] Enhance outline error:', err.message);
    return res.status(502).json({ error: `Outline generation failed: ${err.message}` });
  }
});

// ── Section Generation endpoint (Sequential Document Building) ──────────────────────
app.post('/api/generate-section', async (req, res) => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OPENROUTER_API_KEY not set.' });
  }

  const {
    sectionName,
    sectionDescription,
    wordCount,
    sectionIndex,
    totalSections,
    briefContext = {},
    selectedReferences = [],
    citationGuidance = '',
    referenceStyle = 'APA 7',
    tone = 'Academic',
    outlineFullText = '',
    selectedModel = 'haiku',
  } = req.body;

  if (!sectionName || !wordCount) {
    return res.status(400).json({ error: 'sectionName and wordCount are required.' });
  }

  try {
    const { subject = 'Assignment', taskType = 'Essay', keywords = [], summary = '' } = briefContext;

    // Build focused system prompt for this section only
    const systemPrompt = `You are an expert academic writer. Your ONLY job is to write section ${sectionIndex} of ${totalSections} titled "${sectionName}".

CRITICAL RULES:
1. Write ONLY the content for this section — NO markdown headings (# or ##), just the body text
2. This is section ${sectionIndex} of ${totalSections}: "${sectionName}"
3. Target approximately ${wordCount} words for this section
4. Use ${referenceStyle} citation format: (Author Year) for in-text citations
5. Maintain ${tone} tone throughout this section
6. Do NOT include an introduction or conclusion for the whole essay — just this section's content
7. Return ONLY the section body text with in-text citations`;

    // Build user prompt with section-specific context
    const userPrompt = `Write section ${sectionIndex} of ${totalSections} for the ${taskType} on "${subject}".

SECTION: "${sectionName}"
Description: ${sectionDescription}

SECTION WORD ALLOCATION: Approximately ${wordCount} words

OVERALL CONTEXT (for reference):
Topic: ${subject}
Task Type: ${taskType}
Keywords: ${keywords.join(', ')}
Summary: ${summary}

AVAILABLE REFERENCES TO CITE (${referenceStyle}):
${selectedReferences
  .map((r, idx) => {
    const authors = Array.isArray(r.authors) ? r.authors.join(', ') : r.authors || 'Unknown';
    return `[${idx}] ${authors} (${r.year}). ${r.title}. ${r.sourceName}.`;
  })
  .join('\n')}

${citationGuidance ? `CITATION GUIDANCE: ${citationGuidance}` : 'Use relevant citations where appropriate.'}

REQUIREMENTS:
- Write approximately ${wordCount} words for this section
- Use in-text citations in ${referenceStyle} format: (Author Year)
- Do NOT include section headings or markdown
- Do NOT include introduction/conclusion for the full document
- Focus ONLY on this section's content
- Return plain text only`;

    // Map selected model to OpenRouter model ID
    const modelMap = {
      'sonnet': 'anthropic/claude-sonnet-4.6',
      'haiku': 'anthropic/claude-haiku-4.5',
    };
    const modelToUse = modelMap[selectedModel] || OPENROUTER_MODEL;

    // Call Claude API with focused max_tokens for single section
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3001',
        'X-Title': 'BriefWriter AI',
      },
      body: JSON.stringify({
        model: modelToUse,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 1500, // Per section (smaller than full document)
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`OpenRouter ${response.status}: ${errBody.slice(0, 200)}`);
    }

    const data = await response.json();
    const sectionContent = data.choices?.[0]?.message?.content ?? '';

    if (!sectionContent) {
      throw new Error('No content generated for section');
    }

    // Parse in-text citations from the content: (Author Year) pattern
    const citationRegex = /\(([A-Za-z\s&]+\s+\d{4})\)/g;
    const inTextCitations = [];
    let match;
    while ((match = citationRegex.exec(sectionContent)) !== null) {
      inTextCitations.push(match[1]);
    }

    // Calculate actual word count
    const actualWordCount = sectionContent.split(/\s+/).filter(w => w).length;

    // Return section data
    res.json({
      success: true,
      sectionName,
      content: sectionContent,
      wordCount: actualWordCount,
      inTextCitations: [...new Set(inTextCitations)], // Deduplicate
      citationsUsed: { referenceIndices: [] }, // Could track which refs were used
      tokens: {
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
      },
      timestamp: new Date().toISOString(),
    });

  } catch (err) {
    console.error('[server] Generate section error:', err.message);
    return res.status(502).json({
      success: false,
      error: `Section generation failed: ${err.message}`,
      sectionName,
    });
  }
});

// ── Document Generation endpoint ────────────────────────────────────────────────────
app.post('/api/generate-document', async (req, res) => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OPENROUTER_API_KEY not set.' });
  }

  const { outline, references, referenceStyle = 'APA 7', briefContext = {}, tone = 'Academic', formatSettings = {} } = req.body;

  if (!outline || !Array.isArray(references)) {
    return res.status(400).json({ error: 'outline and references are required.' });
  }

  const { subject = 'Assignment', taskType = 'Essay', wordLimit = 2000, summary = '' } = briefContext;

  // Parse section headings from the outline text to build a strict checklist
  const parsedSections = (outline.match(/^[\d]+\.\s+(.+?)(?:\s*\(\d+\s*words?\))?$/gm) || [])
    .map(m => m.replace(/^[\d]+\.\s+/, '').replace(/\s*\(\d+\s*words?\)$/, '').trim())
    .filter(s => s.length > 0);

  const sectionChecklist = parsedSections.length > 0
    ? parsedSections.map(s => `- ## ${s}`).join('\n')
    : '(Use the section headings found in the outline above)';

  // Format references for the prompt
  const refList = references
    .map((r, idx) => {
      const authors = Array.isArray(r.authors) ? r.authors.join(', ') : r.authors || 'Unknown';
      return `[${idx}] ${r.title} (${r.year}) by ${authors} - ${r.type}`;
    })
    .join('\n');

  const systemPrompt = `You are an expert academic writer. Your ONE job is to write a complete document that STRICTLY follows the provided outline.

CRITICAL RULES — NEVER BREAK THESE:
1. Every section heading from the outline MUST appear as a ## heading in your output, in EXACTLY the same order as the outline
2. Do NOT add any sections that are not in the outline
3. Do NOT skip any section from the outline
4. Do NOT merge or split sections — follow the outline's exact structure
5. Expand each section's content based on its word count allocation and bullet points
6. Writing tone: ${tone} — maintain this tone consistently throughout the entire document
7. Integrate citations naturally using ${referenceStyle} format
8. For in-text citations: use Author (Year) for narrative, (Author, Year) for parenthetical
9. Return ONLY the document body text with ## headings. Do NOT include a reference list.`;

  const userPrompt = `Write a ${taskType.toLowerCase()} on "${subject}" that STRICTLY follows this outline.

Word Limit: ~${wordLimit} words
Reference Style: ${referenceStyle}
Writing Tone: ${tone}
Summary: ${summary}

OUTLINE TO FOLLOW EXACTLY (do not deviate from this structure):
${outline}

MANDATORY SECTION CHECKLIST — every one of these MUST appear as a ## heading in your output:
${sectionChecklist}

Available References to Cite:
${refList}

REQUIREMENTS:
- Follow the outline structure EXACTLY — same sections, same order, same headings
- Each section heading from the outline must become a ## heading in the document
- Expand each section into well-developed paragraphs matching its allocated word count
- Integrate the available references naturally with ${referenceStyle} citations
- Write in ${tone} tone throughout — do not shift tone between sections
- Aim for approximately ${wordLimit} words total across all sections
- Ensure smooth transitions between sections`;

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
      const parseFormattedText = (text, isBold = false, fontSize = 24) => { // fontSize in half-points (24 = 12pt)
        const runs = [];
        let remaining = text;

        while (remaining.length > 0) {
          // Match bold text: **text**
          const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/);
          if (boldMatch) {
            runs.push(new TextRun({
              text: boldMatch[1],
              bold: true,
              font: 'Times New Roman',
              size: fontSize,
            }));
            remaining = remaining.slice(boldMatch[0].length);
            continue;
          }

          // Match italic text: *text* (but not **)
          const italicMatch = remaining.match(/^\*([^*]+)\*(?!\*)/);
          if (italicMatch) {
            runs.push(new TextRun({
              text: italicMatch[1],
              italics: true,
              font: 'Times New Roman',
              size: fontSize,
            }));
            remaining = remaining.slice(italicMatch[0].length);
            continue;
          }

          // Match regular text up to next special char
          const regularMatch = remaining.match(/^[^*]+/);
          if (regularMatch) {
            runs.push(new TextRun({
              text: regularMatch[0],
              bold: isBold,
              font: 'Times New Roman',
              size: fontSize,
            }));
            remaining = remaining.slice(regularMatch[0].length);
          } else {
            // Fallback for single characters
            runs.push(new TextRun({
              text: remaining.charAt(0),
              bold: isBold,
              font: 'Times New Roman',
              size: fontSize,
            }));
            remaining = remaining.slice(1);
          }
        }

        return runs;
      };

      // Add title as heading (Heading 1: 14pt, bold, Times New Roman)
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: title, bold: true, font: 'Times New Roman', size: 28 })], // 28 half-points = 14pt
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
          // Heading 1: 14pt, bold, Times New Roman
          paragraphs.push(
            new Paragraph({
              children: parseFormattedText(h1Match[1], true, 28), // 28 half-points = 14pt, bold=true
              heading: HeadingLevel.HEADING_1,
              spacing: { before: 200, after: 200 },
              alignment: AlignmentType.JUSTIFIED,
            })
          );
        } else if (h2Match) {
          // Heading 2: 12pt, bold, Times New Roman
          paragraphs.push(
            new Paragraph({
              children: parseFormattedText(h2Match[1], true, 24), // 24 half-points = 12pt, bold=true
              heading: HeadingLevel.HEADING_2,
              spacing: { before: 200, after: 200 },
              alignment: AlignmentType.JUSTIFIED,
            })
          );
        } else if (h3Match) {
          // Heading 3: 12pt, bold, Times New Roman
          paragraphs.push(
            new Paragraph({
              children: parseFormattedText(h3Match[1], true, 24), // 12pt, bold=true
              heading: HeadingLevel.HEADING_3,
              spacing: { before: 120, after: 120 },
              alignment: AlignmentType.JUSTIFIED,
            })
          );
        } else if (trimmedPara.toLowerCase() === 'references') {
          // Special case: References heading (Heading 2: 12pt, bold)
          paragraphs.push(
            new Paragraph({
              children: [new TextRun({ text: 'References', bold: true, font: 'Times New Roman', size: 24 })],
              heading: HeadingLevel.HEADING_2,
              spacing: { before: 400, after: 200 },
              alignment: AlignmentType.JUSTIFIED,
            })
          );
        } else {
          // Regular paragraph with formatting support (12pt, justified, Times New Roman)
          const runs = parseFormattedText(trimmedPara, false, 24); // 24 half-points = 12pt
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

      // Add properly formatted references section if formatSettings includes references
      if (formatSettings.referencesSection && references.length > 0) {
        // Add References heading
        paragraphs.push(
          new Paragraph({
            children: [new TextRun({ text: 'References', bold: true, font: 'Times New Roman', size: 24 })],
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 400, after: 200 },
            alignment: AlignmentType.JUSTIFIED,
          })
        );

        // Add each reference as a separate paragraph
        references.forEach((ref) => {
          let refText = '';
          if (referenceStyle.toLowerCase().includes('apa')) {
            const authors = Array.isArray(ref.authors) ? ref.authors.join(', ') : ref.authors || 'Unknown';
            refText = `${authors} (${ref.year}). ${ref.title}. ${ref.sourceName}.`;
          } else if (referenceStyle.toLowerCase().includes('mla')) {
            const authors = Array.isArray(ref.authors) ? ref.authors.join(', ') : ref.authors || 'Unknown';
            refText = `${authors}. "${ref.title}." ${ref.sourceName}, ${ref.year}.`;
          } else if (referenceStyle.toLowerCase().includes('harvard')) {
            const authors = Array.isArray(ref.authors) ? ref.authors.join(', ') : ref.authors || 'Unknown';
            refText = `${authors} ${ref.year}, ${ref.title}, ${ref.sourceName}.`;
          } else {
            const authors = Array.isArray(ref.authors) ? ref.authors.join(', ') : ref.authors || 'Unknown';
            refText = `${authors} (${ref.year}). ${ref.title}. ${ref.sourceName}.`;
          }

          // Add URL/DOI if available
          if (formatSettings.referencesWithLinks) {
            if (ref.url) {
              refText += ` Available at: ${ref.url}`;
            } else if (ref.doi) {
              refText += ` https://doi.org/${ref.doi}`;
            }
          }

          paragraphs.push(
            new Paragraph({
              children: [new TextRun({ text: refText, font: 'Times New Roman', size: 24 })],
              spacing: { line: 240, after: 200, before: 0 },
              alignment: AlignmentType.JUSTIFIED,
              indent: { firstLine: 720, left: 720 }, // Hanging indent for references
            })
          );
        });
      }

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

// ── Assemble DOCX from Multiple Sections ─────────────────────────────────────
app.post('/api/generate-docx-from-sections', async (req, res) => {
  try {
    const { title, briefContext = {}, generatedSections = [], selectedReferences = [], referenceStyle = 'APA 7', formatSettings = {} } = req.body;

    if (!generatedSections || generatedSections.length === 0) {
      return res.status(400).json({ error: 'At least one generated section is required.' });
    }

    // Helper function to parse formatted text with markdown
    const parseFormattedText = (text, isBold = false, fontSize = 24) => {
      const runs = [];
      let remaining = text;

      while (remaining.length > 0) {
        const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/);
        if (boldMatch) {
          runs.push(new TextRun({
            text: boldMatch[1],
            bold: true,
            font: 'Times New Roman',
            size: fontSize,
          }));
          remaining = remaining.slice(boldMatch[0].length);
          continue;
        }

        const italicMatch = remaining.match(/^\*([^*]+)\*(?!\*)/);
        if (italicMatch) {
          runs.push(new TextRun({
            text: italicMatch[1],
            italics: true,
            font: 'Times New Roman',
            size: fontSize,
          }));
          remaining = remaining.slice(italicMatch[0].length);
          continue;
        }

        const regularMatch = remaining.match(/^[^*]+/);
        if (regularMatch) {
          runs.push(new TextRun({
            text: regularMatch[0],
            bold: isBold,
            font: 'Times New Roman',
            size: fontSize,
          }));
          remaining = remaining.slice(regularMatch[0].length);
        } else {
          runs.push(new TextRun({
            text: remaining.charAt(0),
            bold: isBold,
            font: 'Times New Roman',
            size: fontSize,
          }));
          remaining = remaining.slice(1);
        }
      }

      return runs;
    };

    const paragraphs = [];

    // Add title (Heading 1: 14pt, bold, Times New Roman)
    if (title) {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: title, bold: true, font: 'Times New Roman', size: 28 })],
          heading: HeadingLevel.HEADING_1,
          spacing: { after: 400 },
          alignment: AlignmentType.JUSTIFIED,
        })
      );
    }

    // Add each generated section
    generatedSections.forEach((section, idx) => {
      // Section heading (Heading 2: 12pt, bold)
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: section.sectionName, bold: true, font: 'Times New Roman', size: 24 })],
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 200 },
          alignment: AlignmentType.JUSTIFIED,
        })
      );

      // Section content (Body: 12pt, justified, Times New Roman)
      const contentParagraphs = section.content.split('\n').filter(p => p.trim());
      contentParagraphs.forEach((para, paraIdx) => {
        const runs = parseFormattedText(para.trim(), false, 24); // 12pt body text
        paragraphs.push(
          new Paragraph({
            children: runs,
            spacing: { line: 240, after: 200, before: 0 },
            alignment: AlignmentType.JUSTIFIED,
            indent: { firstLine: 720 },
          })
        );
      });
    });

    // Add References section
    if (selectedReferences && selectedReferences.length > 0) {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: 'References', bold: true, font: 'Times New Roman', size: 24 })],
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 400, after: 200 },
          alignment: AlignmentType.JUSTIFIED,
        })
      );

      // Add each reference separately
      selectedReferences.forEach((ref) => {
        let refText = '';
        if (referenceStyle.toLowerCase().includes('apa')) {
          const authors = Array.isArray(ref.authors) ? ref.authors.join(', ') : ref.authors || 'Unknown';
          refText = `${authors} (${ref.year}). ${ref.title}. ${ref.sourceName}.`;
        } else if (referenceStyle.toLowerCase().includes('mla')) {
          const authors = Array.isArray(ref.authors) ? ref.authors.join(', ') : ref.authors || 'Unknown';
          refText = `${authors}. "${ref.title}." ${ref.sourceName}, ${ref.year}.`;
        } else if (referenceStyle.toLowerCase().includes('harvard')) {
          const authors = Array.isArray(ref.authors) ? ref.authors.join(', ') : ref.authors || 'Unknown';
          refText = `${authors} ${ref.year}, ${ref.title}, ${ref.sourceName}.`;
        } else {
          const authors = Array.isArray(ref.authors) ? ref.authors.join(', ') : ref.authors || 'Unknown';
          refText = `${authors} (${ref.year}). ${ref.title}. ${ref.sourceName}.`;
        }

        // Add URL/DOI if available
        if (ref.url) {
          refText += ` Available at: ${ref.url}`;
        } else if (ref.doi) {
          refText += ` https://doi.org/${ref.doi}`;
        }

        paragraphs.push(
          new Paragraph({
            children: [new TextRun({ text: refText, font: 'Times New Roman', size: 24 })],
            spacing: { line: 240, after: 200, before: 0 },
            alignment: AlignmentType.JUSTIFIED,
            indent: { firstLine: 720, left: 720 }, // Hanging indent
          })
        );
      });
    }

    // Create document
    const doc = new Document({
      sections: [{
        children: paragraphs,
        properties: {
          page: {
            margins: {
              top: 1440,
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

    // Calculate total word count
    const totalWordCount = generatedSections.reduce((sum, s) => sum + (s.wordCount || 0), 0);

    res.json({
      success: true,
      title,
      totalWordCount,
      docxBase64,
      sections: generatedSections.length,
      references: selectedReferences.length,
      generatedAt: new Date().toISOString(),
    });

  } catch (err) {
    console.error('[server] Generate DOCX from sections error:', err.message);
    return res.status(502).json({ error: `DOCX generation failed: ${err.message}` });
  }
});

// ── Generate References List ────────────────────────────────────────────────────
app.post('/api/generate-references', async (req, res) => {
  try {
    const { selectedReferences = [], referenceStyle = 'APA 7', selectedModel = 'haiku' } = req.body;

    if (!selectedReferences || selectedReferences.length === 0) {
      return res.status(400).json({ error: 'At least one reference is required.' });
    }

    // Format references based on style
    let formattedReferences = [];

    selectedReferences.forEach((ref) => {
      let formatted = '';

      switch (referenceStyle.toLowerCase()) {
        case 'apa7':
        case 'apa 7':
          // APA 7 Format: Authors (Year). Title. Source. URL
          formatted = `${ref.authors.join(', ')} (${ref.year}). ${ref.title}. ${ref.sourceName}.`;
          if (ref.doi) formatted += ` https://doi.org/${ref.doi}`;
          else if (ref.url) formatted += ` ${ref.url}`;
          break;

        case 'mla9':
        case 'mla 9':
          // MLA 9 Format: Authors. "Title." Source, Year, URL.
          formatted = `${ref.authors.join(', ')}. "${ref.title}." ${ref.sourceName}, ${ref.year}.`;
          if (ref.url) formatted += ` ${ref.url}`;
          break;

        case 'harvard':
          // Harvard Format: Authors, Year. Title. Source. URL.
          formatted = `${ref.authors.join(', ')}, ${ref.year}. ${ref.title}. ${ref.sourceName}.`;
          if (ref.url) formatted += ` Available at: ${ref.url}`;
          break;

        case 'chicago17':
        case 'chicago 17':
          // Chicago Format: Authors. "Title." Source, Year. URL.
          formatted = `${ref.authors.join(', ')}. "${ref.title}." ${ref.sourceName}, ${ref.year}.`;
          if (ref.url) formatted += ` Accessed from ${ref.url}`;
          break;

        default:
          // Default: Authors (Year). Title. Source.
          formatted = `${ref.authors.join(', ')} (${ref.year}). ${ref.title}. ${ref.sourceName}.`;
          if (ref.url) formatted += ` ${ref.url}`;
      }

      formattedReferences.push({
        id: ref.id,
        original: ref.formattedReference || ref.title,
        formatted: formatted,
      });
    });

    res.json({
      success: true,
      referenceStyle,
      count: formattedReferences.length,
      references: formattedReferences,
      formattedText: formattedReferences.map(r => r.formatted).join('\n\n'),
      timestamp: new Date().toISOString(),
    });

  } catch (err) {
    console.error('[server] Generate references error:', err.message);
    return res.status(502).json({ error: `Reference generation failed: ${err.message}` });
  }
});

// ── PPT: Generate slide content ──────────────────────────────────────────────

app.post('/api/generate-ppt-slide', async (req, res) => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'OPENROUTER_API_KEY not set.' });

  const {
    slideNumber, totalSlides, slideTitle, briefContext,
    selectedReferences = [], referenceStyle = 'apa7', outlineText = '',
    selectedModel = 'haiku',
  } = req.body;

  const model = selectedModel === 'sonnet'
    ? 'anthropic/claude-sonnet-4-5'
    : 'anthropic/claude-haiku-4.5';

  // Build a short citation list for the prompt
  const citationList = selectedReferences.slice(0, 20).map((r, i) =>
    `[${i + 1}] ${r.authors?.[0] ?? 'Unknown'} (${r.year}) — ${r.title}`
  ).join('\n');

  const prompt = `You are generating slide ${slideNumber} of ${totalSlides} for a presentation about: "${briefContext?.subject ?? 'the topic'}".

Slide title: "${slideTitle}"

Brief summary: ${briefContext?.summary ?? ''}

Available references (use 2-3 for in-text citations):
${citationList || 'No references provided'}

Task: Write EXACTLY 5 bullet point statements for this slide.
- Each statement must be 12-15 words long
- 2-3 statements should include an in-text citation in (Author, Year) format
- Statements should be factual, concise, and suitable for a presentation slide
- No sub-bullets, no markdown formatting, just plain statements

Return ONLY a valid JSON array of exactly 5 strings, no other text:
["Statement one here (Author, Year).", "Statement two here.", "Statement three (Author, Year).", "Statement four here.", "Statement five here."]`;

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
        model,
        messages: [
          { role: 'system', content: 'You generate concise, factual presentation slide content. Always respond with valid JSON arrays only.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 512,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`OpenRouter ${response.status}: ${errBody}`);
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content ?? '';

    // Parse JSON array
    const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = fenceMatch ? fenceMatch[1] : raw;
    const statements = JSON.parse(jsonStr.trim());

    if (!Array.isArray(statements)) throw new Error('Response is not a JSON array');

    // Extract citations mentioned in statements
    const citationRegex = /\(([A-Za-z\s&]+),?\s*(\d{4})\)/g;
    const citations = [];
    for (const stmt of statements) {
      let m;
      while ((m = citationRegex.exec(stmt)) !== null) {
        citations.push(m[0]);
      }
    }

    res.json({
      success: true,
      slideNumber,
      slideTitle,
      statements: statements.slice(0, 5),
      citations: [...new Set(citations)],
      wordCount: statements.join(' ').split(/\s+/).filter(w => w).length,
    });

  } catch (err) {
    console.error('[server] generate-ppt-slide error:', err.message);
    res.status(502).json({ error: err.message });
  }
});

// ── PPT: Generate presenter script for one slide ─────────────────────────────

app.post('/api/generate-ppt-script', async (req, res) => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'OPENROUTER_API_KEY not set.' });

  const {
    slideNumber, totalSlides, slideTitle, slideBullets = [],
    scriptWordsPerSlide = 90, briefContext, scriptInstructions = '',
    selectedModel = 'haiku',
  } = req.body;

  const model = selectedModel === 'sonnet'
    ? 'anthropic/claude-sonnet-4-5'
    : 'anthropic/claude-haiku-4.5';

  const bulletsText = slideBullets.map((b, i) => `${i + 1}. ${b}`).join('\n');

  const prompt = `You are a presenter giving slide ${slideNumber} of ${totalSlides} titled "${slideTitle}".

The slide contains these bullet points:
${bulletsText}

Write a presenter script in simple, humble English as if speaking directly to the audience.
Write EXACTLY ${scriptWordsPerSlide} words (within ±5 words) in paragraph form only — no bullet points, no headings, no lists.
${scriptInstructions ? `Additional instructions: ${scriptInstructions}` : ''}

Return ONLY the script text, no JSON, no preamble.`;

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
        model,
        messages: [
          { role: 'system', content: 'You write clear, concise presenter scripts for academic presentations. Return only the script text.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 512,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`OpenRouter ${response.status}: ${errBody}`);
    }

    const data = await response.json();
    const script = data.choices?.[0]?.message?.content?.trim() ?? '';

    res.json({
      success: true,
      slideNumber,
      script,
      wordCount: script.split(/\s+/).filter(w => w).length,
    });

  } catch (err) {
    console.error('[server] generate-ppt-script error:', err.message);
    res.status(502).json({ error: err.message });
  }
});

// ── PPT: Assemble PPTX file ───────────────────────────────────────────────────

app.post('/api/generate-pptx', async (req, res) => {
  const { title = 'Presentation', slides = [] } = req.body;

  // Exact layout dimensions matching the reference PPTX (Case study 1.pptx):
  // Slide: 13.33" x 7.5" (LAYOUT_WIDE)
  // Title placeholder:   x=0.917", y=0.399", w=11.500", h=1.450"
  // Content placeholder: x=0.917", y=2.000", w=11.500", h=4.759"
  // Fonts: Calibri Light (title, 40pt bold), Calibri (body, 18pt)
  // Colors: black text on white background, no decorative elements

  const TITLE_X = 0.917, TITLE_Y = 0.399, TITLE_W = 11.5, TITLE_H = 1.45;
  const BODY_X  = 0.917, BODY_Y  = 2.0,   BODY_W  = 11.5, BODY_H  = 4.759;

  try {
    const prs = new pptxgen();
    prs.layout = 'LAYOUT_WIDE'; // 13.33" x 7.5"

    for (const slide of slides) {
      const s = prs.addSlide();

      // White background
      s.background = { color: 'FFFFFF' };

      // Title — Calibri Light, 40pt, bold, black, left-aligned
      s.addText(slide.title || `Slide ${slide.slideNumber}`, {
        x: TITLE_X, y: TITLE_Y, w: TITLE_W, h: TITLE_H,
        fontFace: 'Calibri Light',
        fontSize: 40,
        bold: true,
        color: '000000',
        align: 'left',
        valign: 'middle',
        wrap: true,
        margin: 0,
      });

      // Bullet statements — one text box with all bullets, Calibri 18pt
      // Build array of text runs for pptxgenjs multi-paragraph support
      const statements = (slide.statements || []).slice(0, 5);
      if (statements.length > 0) {
        const textItems = statements.map((stmt, i) => ([
          {
            text: stmt,
            options: {
              bullet: { type: 'number', indent: 0 },
              fontFace: 'Calibri',
              fontSize: 18,
              color: '000000',
              breakLine: true,
              paraSpaceBefore: i === 0 ? 0 : 6,
            },
          },
        ])).flat();

        s.addText(textItems, {
          x: BODY_X, y: BODY_Y, w: BODY_W, h: BODY_H,
          fontFace: 'Calibri',
          fontSize: 18,
          color: '000000',
          align: 'left',
          valign: 'top',
          wrap: true,
          margin: 0,
          autoFit: true,
        });
      }
    }

    const pptxBase64 = await prs.write({ outputType: 'base64' });

    res.json({
      success: true,
      pptxBase64,
      title,
      slideCount: slides.length,
    });

  } catch (err) {
    console.error('[server] generate-pptx error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── PPT: Assemble script DOCX ─────────────────────────────────────────────────

app.post('/api/generate-script-docx', async (req, res) => {
  const { title = 'Presenter Script', slides = [] } = req.body;

  try {
    const children = [
      new Paragraph({
        text: title,
        heading: HeadingLevel.TITLE,
        spacing: { after: 400 },
      }),
    ];

    for (const slide of slides) {
      // Slide heading
      children.push(new Paragraph({
        children: [
          new TextRun({
            text: `Slide ${slide.slideNumber}: ${slide.title}`,
            bold: true,
            size: 28,
          }),
        ],
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 400, after: 120 },
      }));

      // Bullet points (small, grey)
      for (const stmt of (slide.statements || [])) {
        children.push(new Paragraph({
          children: [new TextRun({ text: `• ${stmt}`, color: '666666', size: 18 })],
          spacing: { after: 60 },
        }));
      }

      // Script paragraph
      if (slide.script) {
        children.push(new Paragraph({
          children: [new TextRun({ text: slide.script, size: 22 })],
          spacing: { before: 160, after: 320 },
        }));
      }
    }

    const doc = new Document({ sections: [{ children }] });
    const buffer = await Packer.toBuffer(doc);
    const docxBase64 = buffer.toString('base64');

    const totalWords = slides.reduce((sum, s) => {
      return sum + (s.script ? s.script.split(/\s+/).filter(w => w).length : 0);
    }, 0);

    res.json({
      success: true,
      docxBase64,
      wordCount: totalWords,
    });

  } catch (err) {
    console.error('[server] generate-script-docx error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Start ───────────────────────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[brief-server] http://localhost:${PORT}`);
  console.log(`[brief-server] OPENROUTER_API_KEY: ${process.env.OPENROUTER_API_KEY ? 'SET ✓' : 'MISSING ✗'}`);
  console.log(`[brief-server] Model: ${OPENROUTER_MODEL}`);
});
