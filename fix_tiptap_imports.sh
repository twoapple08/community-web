#!/bin/bash
set -e

echo "=========================================================="
echo " [SFA Clan] Tiptap Table Named Import 구문 보정 및 빌드 패치"
echo "=========================================================="

python3 - << 'PY_FIX'
with open("src/components/Editor.tsx", "r", encoding="utf-8") as f:
    code = f.read()

# 1. Turbopack 호환 Named Import 로 교체
code = code.replace("import TextAlign from '@tiptap/extension-text-align'", "import { TextAlign } from '@tiptap/extension-text-align'")
code = code.replace("import Table from '@tiptap/extension-table'", "import { Table } from '@tiptap/extension-table'")
code = code.replace("import TableRow from '@tiptap/extension-table-row'", "import { TableRow } from '@tiptap/extension-table-row'")
code = code.replace("import TableCell from '@tiptap/extension-table-cell'", "import { TableCell } from '@tiptap/extension-table-cell'")
code = code.replace("import TableHeader from '@tiptap/extension-table-header'", "import { TableHeader } from '@tiptap/extension-table-header'")

with open("src/components/Editor.tsx", "w", encoding="utf-8") as f:
    f.write(code)

print("Editor.tsx: Tiptap Table & TextAlign import 문법 보정 완료")
PY_FIX

echo "--> 소스코드 정비 완료. 프로덕션 빌드 검증을 실행합니다..."
npm run build

echo "=========================================================="
echo " [빌드 통과] 에러 없음! Git 실서버 배포를 진행합니다."
echo "=========================================================="

git add .
git commit -m "fix: Tiptap Table 및 TextAlign Named Import 적용 (Turbopack 빌드 에러 해결)"
git push origin main || git push origin master

echo "=========================================================="
echo " [배포 완료] 실서버에 최신 코드가 정상 배포되었습니다!"
echo "=========================================================="
