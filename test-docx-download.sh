#!/bin/bash

echo "[1] Testing DOCX Base64 decode..."

# Sample JSON payload
PAYLOAD='
{
  "outline": "1. Introduction\n2. Main Discussion\n3. Conclusion",
  "references": [
    {
      "id": "1",
      "title": "Sample Article",
      "authors": ["Smith, John"],
      "year": 2023,
      "sourceName": "Journal of Example",
      "type": "article"
    }
  ],
  "referenceStyle": "APA 7",
  "briefContext": {
    "subject": "Test Document",
    "taskType": "Essay",
    "wordLimit": 500
  }
}
'

# Get the API response
RESPONSE=$(curl -s -X POST http://localhost:3001/api/generate-document \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

# Extract docxBase64
DOCX_BASE64=$(echo "$RESPONSE" | grep -o '"docxBase64":"[^"]*"' | cut -d'"' -f4)

if [ -z "$DOCX_BASE64" ]; then
  echo "[ERROR] Could not extract docxBase64 from response"
  exit 1
fi

# Decode Base64 to a DOCX file
OUTPUT_FILE="/tmp/test-document.docx"
echo "$DOCX_BASE64" | base64 -d > "$OUTPUT_FILE" 2>/dev/null

# Check file size
FILE_SIZE=$(ls -lh "$OUTPUT_FILE" | awk '{print $5}')
echo "[SUCCESS] DOCX file created: $OUTPUT_FILE (size: $FILE_SIZE)"

# Check if it's a valid ZIP (DOCX is a ZIP archive)
if file "$OUTPUT_FILE" | grep -q "Zip archive"; then
  echo "[SUCCESS] File is a valid ZIP archive (DOCX format)"
else
  MAGIC=$(hexdump -C "$OUTPUT_FILE" | head -1)
  echo "[INFO] File magic bytes: $MAGIC"
fi

# List DOCX contents
echo ""
echo "[2] DOCX Contents:"
unzip -l "$OUTPUT_FILE" 2>/dev/null | head -20

echo ""
echo "[SUCCESS] DOCX download test complete!"
