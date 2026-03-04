#!/bin/bash

# Test the /api/generate-document endpoint to verify DOCX generation

echo "[1] Testing /api/generate-document endpoint..."

# Sample JSON payload
PAYLOAD='
{
  "outline": "1. Introduction\n2. Main Discussion\n3. Conclusion",
  "references": [
    {
      "id": "1",
      "title": "Sample Article",
      "authors": ["Smith, John", "Doe, Jane"],
      "year": 2023,
      "sourceName": "Journal of Example",
      "type": "article"
    },
    {
      "id": "2",
      "title": "Another Source",
      "authors": ["Brown, Bob"],
      "year": 2022,
      "sourceName": "Example Publication",
      "type": "book"
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

# Check response
if echo "$RESPONSE" | grep -q "docxBase64"; then
  echo "[SUCCESS] docxBase64 field found in response"
  
  # Extract docxBase64 value length
  DOCX_BASE64_LEN=$(echo "$RESPONSE" | grep -o '"docxBase64":"[^"]*"' | wc -c)
  echo "[INFO] docxBase64 length: $DOCX_BASE64_LEN characters"
  
  # Verify it starts with valid Base64
  DOCX_BASE64=$(echo "$RESPONSE" | grep -o '"docxBase64":"[^"]*"' | cut -d'"' -f4)
  
  # Check if it's not null
  if [ "$DOCX_BASE64" != "null" ] && [ ! -z "$DOCX_BASE64" ]; then
    echo "[SUCCESS] docxBase64 is not null"
    echo "[INFO] First 50 chars: ${DOCX_BASE64:0:50}"
  else
    echo "[WARNING] docxBase64 is null or empty"
  fi
  
  # Extract other fields
  if echo "$RESPONSE" | grep -q '"documentText"'; then
    echo "[SUCCESS] documentText field found"
  fi
  
  if echo "$RESPONSE" | grep -q '"title"'; then
    echo "[SUCCESS] title field found"
  fi
  
  if echo "$RESPONSE" | grep -q '"wordCount"'; then
    echo "[SUCCESS] wordCount field found"
  fi
else
  echo "[ERROR] docxBase64 field NOT found in response"
  echo "[RESPONSE] $RESPONSE"
fi

echo ""
echo "[2] Full response (first 500 chars):"
echo "$RESPONSE" | head -c 500
echo "..."
