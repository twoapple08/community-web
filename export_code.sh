#!/bin/bash
OUTPUT_FILE="project_codebase.txt"
echo "# SFA CLAN 커뮤니티 전체 소스코드 추출본" > "$OUTPUT_FILE"
echo "생성일자: $(date)" >> "$OUTPUT_FILE"
echo "=========================================" >> "$OUTPUT_FILE"

# 핵심 대상 파일 및 폴더 탐색
find src public/icon.png package.json tailwind.config.js tailwind.config.ts next.config.js next.config.mjs tsconfig.json -type f 2>/dev/null | while read -r file; do
    # 바이너리 및 이미지 제외한 텍스트 파일만 본문 포함
    if [[ "$file" =~ \.(png|ico|jpg|jpeg|gif|webp)$ ]]; then
        echo -e "\n\n/* [파일 확인] $file (바이너리/이미지 파일) */\n" >> "$OUTPUT_FILE"
    else
        echo -e "\n\n/* =========================================" >> "$OUTPUT_FILE"
        echo "   FILE: $file" >> "$OUTPUT_FILE"
        echo "   ========================================= */" >> "$OUTPUT_FILE"
        cat "$file" >> "$OUTPUT_FILE"
    fi
done

echo -e "\n\n/* =========================================" >> "$OUTPUT_FILE"
echo "   SUPABASE DATABASE RPC FUNCTIONS" >> "$OUTPUT_FILE"
echo "   ========================================= */" >> "$OUTPUT_FILE"
cat << 'SQL_DUMP' >> "$OUTPUT_FILE"
-- reindex_post_ids RPC FUNCTION
CREATE OR REPLACE FUNCTION reindex_post_ids()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INT := 0;
BEGIN
  SET LOCAL session_replication_role = 'replica';

  CREATE TEMP TABLE temp_id_map ON COMMIT DROP AS
  SELECT id AS old_id, ROW_NUMBER() OVER (ORDER BY created_at ASC) AS new_id
  FROM posts;

  UPDATE posts p SET id = -m.new_id FROM temp_id_map m WHERE p.id = m.old_id;
  UPDATE post_likes pl SET post_id = m.new_id FROM temp_id_map m WHERE pl.post_id = m.old_id;
  UPDATE post_reports pr SET post_id = m.new_id FROM temp_id_map m WHERE pr.post_id = m.old_id;

  UPDATE posts SET id = -id WHERE id < 0;

  SELECT COUNT(*) INTO v_count FROM posts;
  IF v_count > 0 THEN
    PERFORM setval(pg_get_serial_sequence('posts', 'id'), v_count, true);
  ELSE
    PERFORM setval(pg_get_serial_sequence('posts', 'id'), 1, false);
  END IF;

  SET LOCAL session_replication_role = 'origin';
  RETURN jsonb_build_object('success', true, 'count', v_count);
EXCEPTION WHEN OTHERS THEN
  SET LOCAL session_replication_role = 'origin';
  RAISE;
END;
$$;
SQL_DUMP

echo "추출이 완료되었습니다: $OUTPUT_FILE"
ls -lh "$OUTPUT_FILE"
