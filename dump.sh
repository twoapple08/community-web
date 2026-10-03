#!/bin/bash
OUTPUT="all_sources.txt"
> "$OUTPUT"

echo "=== package.json ===" >> "$OUTPUT"
cat package.json >> "$OUTPUT"
echo -e "\n" >> "$OUTPUT"

find src -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.css" \) | sort | while read -r file; do
  echo "=== $file ===" >> "$OUTPUT"
  cat "$file" >> "$OUTPUT"
  echo -e "\n" >> "$OUTPUT"
done

echo "추출 완료: $OUTPUT"
