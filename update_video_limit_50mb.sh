#!/bin/bash
set -e

echo "=========================================================="
echo " [SFA Clan] 동영상 첨부 용량 제한 50MB로 변경 및 배포"
echo "=========================================================="

python3 - << 'PY_UPDATE'
with open("src/components/Editor.tsx", "r", encoding="utf-8") as f:
    code = f.read()

# 1GB 검사 로직을 50MB 검사로 교체
old_limit = "const maxSizeBytes = 1024 * 1024 * 1024;"
new_limit = "const maxSizeBytes = 50 * 1024 * 1024; // 50MB 제한"

old_msg = "message: '동영상 파일 크기는 최대 1GB(1024MB)까지 첨부할 수 있습니다.',"
new_msg = "message: '동영상 파일 크기는 최대 50MB까지 첨부할 수 있습니다. (고용량/긴 영상은 유튜브 링크를 이용해 주시기 바랍니다)',"

old_title = 'title="동영상 첨부 (최대 1GB, 첫 프레임 자동 썸네일)"'
new_title = 'title="동영상 첨부 (최대 50MB, 첫 프레임 자동 썸네일)"'

if old_limit in code:
    code = code.replace(old_limit, new_limit)
if old_msg in code:
    code = code.replace(old_msg, new_msg)
if old_title in code:
    code = code.replace(old_title, new_title)

with open("src/components/Editor.tsx", "w", encoding="utf-8") as f:
    f.write(code)

print("Editor.tsx: 50MB 용량 제한 및 안내 문구 갱신 완료")
PY_UPDATE

echo "--> 소스코드 정비 완료. 프로덕션 빌드 검증을 실행합니다..."
npm run build

echo "=========================================================="
echo " [빌드 통과] 검증 완료! Git 실서버 배포를 진행합니다."
echo "=========================================================="

git add .
git commit -m "fix: 동영상 업로드 용량 제한 50MB(무료 티어 안전권)로 조정"
git push origin main || git push origin master

echo "=========================================================="
echo " [배포 완료] 실서버에 최신 코드가 정상 배포되었습니다!"
echo "=========================================================="
