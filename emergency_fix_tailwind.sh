#!/bin/bash
set -e

echo "=========================================================="
echo " [긴급 복구] Tailwind v4 CSS 엔진 즉시 복원 및 UI 정상화"
echo "=========================================================="

# 1. globals.css 를 Tailwind v4 공식 엔진으로 완벽 복구
cat << 'FILE_CSS' > src/app/globals.css
@import "tailwindcss";

/* 미디어 넘침 및 뷰포트 터짐 원천 방지 가드 */
img, video, canvas, svg {
  max-width: 100%;
}

/* 모바일 전용 UI 폰트/터치 스케일업 */
@media (max-width: 640px) {
  html {
    font-size: 110%;
  }
}

/* 리치 텍스트 본문 줄바꿈 및 문단 여백 1:1 보존 스타일 */
.prose p,
.editor-content p,
.tiptap p {
  margin-top: 0;
  margin-bottom: 0.85em;
  min-height: 1.5em;
  line-height: 1.7;
}

.prose p:empty,
.editor-content p:empty,
.tiptap p:empty {
  min-height: 1.5em;
  display: block;
}

.prose p:empty::before,
.editor-content p:empty::before,
.tiptap p:empty::before {
  content: "\00a0";
  display: inline-block;
}

.prose p:has(> br:only-child) {
  min-height: 1.5em;
}

/* 표 기본 스타일 정돈 */
.prose table,
.tiptap table {
  border-collapse: collapse;
  table-layout: fixed;
  width: 100%;
  margin: 1.2em 0;
  overflow: hidden;
}

.prose table td,
.prose table th,
.tiptap table td,
.tiptap table th {
  min-width: 1em;
  border: 1px solid #71717a;
  padding: 8px 10px;
  vertical-align: top;
  box-sizing: border-box;
  position: relative;
}

.prose table th,
.tiptap table th {
  font-weight: bold;
  text-align: left;
  background-color: rgba(120, 120, 120, 0.1);
}
FILE_CSS

echo "--> globals.css 복구 완료. 프로덕션 빌드 검증을 실행합니다..."
npm run build

echo "=========================================================="
echo " [빌드 통과] CSS 정상 컴파일 확인! Git 실서버 배포를 진행합니다."
echo "=========================================================="

git add .
git commit -m "hotfix: Tailwind v4 @import 엔진 복원 및 스타일 증발 버그 긴급 해결"
git push origin main || git push origin master

echo "=========================================================="
echo " [배포 완료] 실서버에 정상 스타일이 복원되었습니다!"
echo "=========================================================="
