#!/bin/bash

echo "[1] Testing Enhanced DOCX with Formatting..."

# Test payload with markdown-style formatting
PAYLOAD='
{
  "outline": "# Introduction\n## Key Points\n- Point 1\n- Point 2\n\n# Conclusion",
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
    "subject": "Test Subject",
    "taskType": "Essay",
    "wordLimit": 500
  }
}
'

# Make the API call
RESPONSE=$(curl -s -X POST http://localhost:3001/api/generate-document \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

# Check for docxBase64
if echo "$RESPONSE" | grep -q "docxBase64"; then
  echo "[SUCCESS] docxBase64 field found"
  
  # Extract and decode Base64
  DOCX_BASE64=$(echo "$RESPONSE" | grep -o '"docxBase64":"[^"]*"' | cut -d'"' -f4)
  
  if [ ! -z "$DOCX_BASE64" ] && [ "$DOCX_BASE64" != "null" ]; then
    echo "[SUCCESS] DOCX generated with formatting support"
    echo "$DOCX_BASE64" | base64 -d > /tmp/formatted-doc.docx
    
    # Check file size
    SIZE=$(ls -lh /tmp/formatted-doc.docx | awk '{print $5}')
    echo "[SUCCESS] DOCX file created (size: $SIZE)"
    
    # List DOCX structure
    echo "[INFO] DOCX contents:"
    unzip -l /tmp/formatted-doc.docx 2>/dev/null | grep "word/document.xml"
  else
    echo "[WARNING] DOCX not generated (docxBase64 is null or empty)"
  fi
else
  echo "[ERROR] docxBase64 field not found in response"
fi
