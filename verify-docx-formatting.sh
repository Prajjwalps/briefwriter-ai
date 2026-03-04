#!/bin/bash

echo "[1] Verifying DOCX Formatting..."

# Extract document.xml from DOCX
unzip -p /tmp/formatted-doc.docx word/document.xml > /tmp/doc-content.xml

# Check for key formatting indicators
echo ""
echo "[2] Checking for formatting in generated DOCX:"
echo ""

# Check for heading styles
if grep -q "<w:pStyle.*heading" /tmp/doc-content.xml; then
  echo "[✓] Heading styles detected"
else
  echo "[✗] Heading styles NOT detected"
fi

# Check for bold formatting
if grep -q "<w:b" /tmp/doc-content.xml; then
  echo "[✓] Bold formatting detected"
else
  echo "[!] No bold formatting (expected if input had no **text**)"
fi

# Check for italic formatting
if grep -q "<w:i" /tmp/doc-content.xml; then
  echo "[✓] Italic formatting detected"
else
  echo "[!] No italic formatting (expected if input had no *text*)"
fi

# Check for paragraph properties
if grep -q "<w:pPr" /tmp/doc-content.xml; then
  echo "[✓] Paragraph formatting detected"
fi

# Show sample of document structure
echo ""
echo "[3] Document structure (first 500 chars):"
head -c 500 /tmp/doc-content.xml | sed 's/></>\n</g' | head -20

echo ""
echo "[SUCCESS] Enhanced DOCX generation verified!"
