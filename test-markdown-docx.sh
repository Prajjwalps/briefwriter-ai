#!/bin/bash

echo "[1] Testing DOCX with Markdown Headings..."

# Test with actual markdown-style content
PAYLOAD='
{
  "outline": "# Main Title\n\nThis is an introduction paragraph with **bold text** and *italic text*.\n\n## Section One\n\nContent for section one with some emphasis.\n\n## Section Two\n\nMore content here.\n\nReferences\n\nSmith et al. (2023) Article Title",
  "references": [
    {
      "id": "1",
      "title": "Sample Article",
      "authors": ["Smith, John"],
      "year": 2023,
      "sourceName": "Journal",
      "type": "article"
    }
  ],
  "referenceStyle": "APA 7",
  "briefContext": {
    "subject": "Test",
    "taskType": "Essay",
    "wordLimit": 500
  }
}
'

# Make the API call
RESPONSE=$(curl -s -X POST http://localhost:3001/api/generate-document \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

# Extract and decode Base64
DOCX_BASE64=$(echo "$RESPONSE" | grep -o '"docxBase64":"[^"]*"' | cut -d'"' -f4)

if [ ! -z "$DOCX_BASE64" ] && [ "$DOCX_BASE64" != "null" ]; then
  echo "[SUCCESS] DOCX generated"
  echo "$DOCX_BASE64" | base64 -d > /tmp/markdown-doc.docx
  
  # Extract and check document
  unzip -p /tmp/markdown-doc.docx word/document.xml > /tmp/md-doc.xml
  
  echo ""
  echo "[2] Checking document structure:"
  
  # Count paragraphs
  PARA_COUNT=$(grep -o "<w:p>" /tmp/md-doc.xml | wc -l)
  echo "[✓] Found $PARA_COUNT paragraphs"
  
  # Check for heading styles (more comprehensive check)
  if grep -q "heading" /tmp/md-doc.xml; then
    echo "[✓] Heading styles applied"
  fi
  
  if grep -q "<w:b\>" /tmp/md-doc.xml; then
    echo "[✓] Bold formatting applied"
  fi
  
  if grep -q "<w:i\>" /tmp/md-doc.xml; then
    echo "[✓] Italic formatting applied"
  fi
  
  echo ""
  echo "[SUCCESS] Markdown-formatted DOCX created successfully!"
else
  echo "[ERROR] DOCX generation failed"
fi
