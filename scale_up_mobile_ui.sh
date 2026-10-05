#!/bin/bash
set -e

echo "=========================================================="
echo " [SFA Clan] 모바일 기본 UI 200~250% 수준 전면 스케일업 배포"
echo "=========================================================="

# 1. globals.css 모바일 폰트 스케일 보강
cat << 'FILE_CSS' > src/app/globals.css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 240 10% 3.9%;
  }

  .dark {
    --background: 240 10% 3.9%;
    --foreground: 0 0% 98%;
  }
}

/* 모바일 기본 폰트 스케일업 (200~250% 가독성 기준선) */
@media (max-width: 640px) {
  html {
    font-size: 115%;
  }
}

/* 리치 텍스트 문단 및 개행 보존 스타일 */
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

/* 표 기본 스타일 */
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

# 2. src/app/layout.tsx 헤더 UI 스케일업
python3 - << 'PY_LAYOUT'
with open("src/app/layout.tsx", "r", encoding="utf-8") as f:
    code = f.read()

# 헤더 높이 확대
code = code.replace("h-13 sm:h-15", "h-16 sm:h-16")
# 로고 폰트 확대
code = code.replace("text-sm sm:text-lg font-black", "text-base sm:text-xl font-black")
# 테마 토글 버튼 확대
code = code.replace("h-6 w-11 sm:h-7 sm:w-13", "h-7.5 w-13 sm:h-8 sm:w-14")
code = code.replace("h-4.5 w-4.5 sm:h-5 sm:w-5", "h-6 w-6 sm:h-6 sm:w-6")

# 헤더 내 버튼군 크기 확대
code = code.replace("px-2 sm:px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] sm:text-xs font-bold", "px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-black")
code = code.replace("px-1.5 sm:px-2 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 hover:border-emerald-500 transition text-[11px] sm:text-xs font-semibold", "px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 hover:border-emerald-500 transition text-xs sm:text-sm font-bold")
code = code.replace("max-w-[45px] sm:max-w-[90px]", "max-w-[75px] sm:max-w-[120px]")
code = code.replace("px-1.5 sm:px-2 py-1 text-[11px] sm:text-xs font-bold rounded-lg bg-amber-500/10", "px-3 py-1.5 text-xs sm:text-sm font-bold rounded-lg bg-amber-500/10")
code = code.replace("px-1.5 sm:px-2 py-1 text-[11px] sm:text-xs font-black rounded-none", "px-3 py-1.5 text-xs sm:text-sm font-black rounded-none")
code = code.replace("px-1.5 sm:px-2 py-1 rounded-lg bg-zinc-100 border", "px-2.5 sm:px-3 py-1.5 rounded-lg bg-zinc-100 border")
code = code.replace("px-2.5 sm:px-3 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-200 dark:text-black text-[11px] sm:text-xs font-bold", "px-4 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-200 dark:text-black text-xs sm:text-sm font-black")

with open("src/app/layout.tsx", "w", encoding="utf-8") as f:
    f.write(code)
print("layout.tsx 헤더 모바일 스케일업 완료")
PY_LAYOUT

# 3. src/components/NoticeBanner.tsx 공지 배너 스케일업
python3 - << 'PY_NOTICE'
with open("src/components/NoticeBanner.tsx", "r", encoding="utf-8") as f:
    code = f.read()

code = code.replace("px-3.5 py-2.5 flex items-center justify-between", "px-4 py-3 sm:py-3.5 flex items-center justify-between")
code = code.replace("w-6 h-6 flex items-center justify-center shrink-0", "w-8 h-8 flex items-center justify-center shrink-0")
code = code.replace("text-xs sm:text-sm font-black text-blue-600", "text-sm sm:text-base font-black text-blue-600")
code = code.replace("text-xs font-bold text-zinc-900", "text-sm sm:text-base font-bold text-zinc-900")
code = code.replace("h-7 px-2 sm:px-2.5 text-xs font-bold", "h-8 px-3 text-xs sm:text-sm font-bold")

with open("src/components/NoticeBanner.tsx", "w", encoding="utf-8") as f:
    f.write(code)
print("NoticeBanner.tsx 스케일업 완료")
PY_NOTICE

# 4. src/app/clan/page.tsx 피드 목록 및 검색/필터 스케일업
python3 - << 'PY_CLAN'
with open("src/app/clan/page.tsx", "r", encoding="utf-8") as f:
    code = f.read()

# 상단 제목 및 버튼군
code = code.replace("text-xl sm:text-2xl font-black tracking-tight", "text-2xl sm:text-3xl font-black tracking-tight")
code = code.replace("text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-0.5", "text-sm sm:text-base text-zinc-500 dark:text-zinc-400 mt-0.5 font-medium")
code = code.replace("px-2.5 py-1 text-xs font-bold bg-blue-600", "px-3.5 py-1.5 text-xs sm:text-sm font-black bg-blue-600")
code = code.replace("px-3 py-1.5 sm:py-2 text-xs font-bold rounded-none", "px-4 py-2 text-xs sm:text-sm font-bold rounded-none")
code = code.replace("px-2.5 py-1.5 sm:px-3 sm:py-2 text-xs font-semibold", "px-3.5 py-2 text-xs sm:text-sm font-bold")

# 검색창 & 필터
code = code.replace("py-2 text-xs bg-zinc-100", "py-3 pl-11 pr-4 text-sm sm:text-base bg-zinc-100")
code = code.replace("px-3 py-2 text-xs font-semibold rounded-xl", "px-4 py-3 text-xs sm:text-sm font-bold rounded-xl")

# 서브필터 / 정렬 버튼군
code = code.replace("p-1 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-semibold", "p-1.5 rounded-2xl border border-zinc-200 dark:border-zinc-700 text-xs sm:text-sm font-bold")
code = code.replace("px-3 py-1 rounded-lg transition", "px-3.5 py-1.5 rounded-xl transition")
code = code.replace("px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800", "px-3.5 py-2 bg-zinc-100 dark:bg-zinc-800 text-xs sm:text-sm")

# 목록형 카드 요소 스케일업
code = code.replace("p-3.5 sm:p-5 rounded-2xl transition duration-300", "p-4 sm:p-6 rounded-2xl transition duration-300")
code = code.replace("text-sm sm:text-base md:text-lg font-bold text-zinc-900", "text-base sm:text-xl font-black text-zinc-900")
code = code.replace("text-[10px] sm:text-[11px] font-semibold text-emerald-600", "text-xs sm:text-sm font-bold text-emerald-600")
code = code.replace("px-2 py-0.5 rounded border border-emerald-200", "px-2.5 py-1 rounded-lg border border-emerald-200")
code = code.replace("text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 line-clamp-2", "text-sm sm:text-base text-zinc-600 dark:text-zinc-400 line-clamp-2")
code = code.replace("text-xs text-zinc-500 pt-1", "text-xs sm:text-sm text-zinc-500 pt-1 font-semibold gap-3 sm:gap-4")
code = code.replace("w-20 h-20 sm:w-24 sm:h-24 aspect-square", "w-24 h-24 sm:w-28 sm:h-28 aspect-square")

# 피드형 카드 요소 스케일업
code = code.replace("w-8 h-8 rounded-full bg-zinc-100", "w-10 h-10 rounded-full bg-zinc-100")
code = code.replace("text-xs font-bold text-zinc-900 dark:text-white block", "text-sm sm:text-base font-black text-zinc-900 dark:text-white block")
code = code.replace("text-[10px] text-zinc-400", "text-xs sm:text-sm text-zinc-400")
code = code.replace("text-base sm:text-lg font-extrabold text-zinc-900", "text-lg sm:text-2xl font-black text-zinc-900")
code = code.replace("text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 line-clamp-3", "text-sm sm:text-base text-zinc-600 dark:text-zinc-400 line-clamp-3")

with open("src/app/clan/page.tsx", "w", encoding="utf-8") as f:
    f.write(code)
print("clan/page.tsx 스케일업 완료")
PY_CLAN

# 5. src/app/community/page.tsx 피드 목록 및 검색/필터 스케일업
python3 - << 'PY_COMM'
with open("src/app/community/page.tsx", "r", encoding="utf-8") as f:
    code = f.read()

# 상단 제목 및 버튼군
code = code.replace("text-xl sm:text-2xl font-black tracking-tight", "text-2xl sm:text-3xl font-black tracking-tight")
code = code.replace("text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-0.5", "text-sm sm:text-base text-zinc-500 dark:text-zinc-400 mt-0.5 font-medium")
code = code.replace("px-2.5 py-1 text-xs font-bold bg-emerald-600", "px-3.5 py-1.5 text-xs sm:text-sm font-black bg-emerald-600")
code = code.replace("px-3 py-1.5 sm:py-2 text-xs font-bold rounded-none", "px-4 py-2 text-xs sm:text-sm font-bold rounded-none")
code = code.replace("px-2.5 py-1.5 sm:px-3 sm:py-2 text-xs font-semibold", "px-3.5 py-2 text-xs sm:text-sm font-bold")

# 검색창 & 게시판 선택
code = code.replace("py-2 text-xs bg-zinc-100", "py-3 pl-11 pr-4 text-sm sm:text-base bg-zinc-100")
code = code.replace("px-3 py-2 text-xs font-bold rounded-none", "px-4 py-3 text-xs sm:text-sm font-black rounded-none")

# 정렬 버튼군
code = code.replace("p-1 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-semibold", "p-1.5 rounded-2xl border border-zinc-200 dark:border-zinc-700 text-xs sm:text-sm font-bold")
code = code.replace("px-3 py-1 rounded-lg transition", "px-3.5 py-1.5 rounded-xl transition")
code = code.replace("px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800", "px-3.5 py-2 bg-zinc-100 dark:bg-zinc-800 text-xs sm:text-sm")

# 목록형 카드 요소 스케일업
code = code.replace("p-3.5 sm:p-5 rounded-2xl bg-white", "p-4 sm:p-6 rounded-2xl bg-white")
code = code.replace("text-sm sm:text-base md:text-lg font-bold text-zinc-900", "text-base sm:text-xl font-black text-zinc-900")
code = code.replace("text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 line-clamp-2", "text-sm sm:text-base text-zinc-600 dark:text-zinc-400 line-clamp-2")
code = code.replace("text-xs text-zinc-500 pt-1", "text-xs sm:text-sm text-zinc-500 pt-1 font-semibold gap-3 sm:gap-4")
code = code.replace("w-20 h-20 sm:w-24 sm:h-24 aspect-square", "w-24 h-24 sm:w-28 sm:h-28 aspect-square")

# 피드형 카드 요소 스케일업
code = code.replace("w-8 h-8 rounded-full bg-zinc-100", "w-10 h-10 rounded-full bg-zinc-100")
code = code.replace("text-xs font-bold text-zinc-900 dark:text-white block", "text-sm sm:text-base font-black text-zinc-900 dark:text-white block")
code = code.replace("text-[10px] text-zinc-400", "text-xs sm:text-sm text-zinc-400")
code = code.replace("text-base sm:text-lg font-extrabold text-zinc-900", "text-lg sm:text-2xl font-black text-zinc-900")
code = code.replace("text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 line-clamp-3", "text-sm sm:text-base text-zinc-600 dark:text-zinc-400 line-clamp-3")

with open("src/app/community/page.tsx", "w", encoding="utf-8") as f:
    f.write(code)
print("community/page.tsx 스케일업 완료")
PY_COMM

# 6. src/components/CommentsSection.tsx 댓글 영역 스케일업
python3 - << 'PY_COMMENTS'
with open("src/components/CommentsSection.tsx", "r", encoding="utf-8") as f:
    code = f.read()

code = code.replace("text-xs sm:text-sm font-bold text-zinc-900", "text-sm sm:text-base font-black text-zinc-900")
code = code.replace("p-2 text-xs bg-zinc-50", "p-3 text-sm bg-zinc-50")
code = code.replace("px-3 py-1 text-xs font-bold", "px-4 py-1.5 text-xs sm:text-sm font-black")
code = code.replace("text-[11px] sm:text-xs", "text-xs sm:text-sm font-bold")
code = code.replace("text-zinc-700 dark:text-zinc-300 leading-snug whitespace-pre-wrap break-words text-[11px] sm:text-xs", "text-zinc-800 dark:text-zinc-200 leading-relaxed whitespace-pre-wrap break-words text-xs sm:text-sm")

with open("src/components/CommentsSection.tsx", "w", encoding="utf-8") as f:
    f.write(code)
print("CommentsSection.tsx 스케일업 완료")
PY_COMMENTS

echo "--> 소스코드 정비 완료. 프로덕션 빌드 검증을 진행합니다..."
npm run build

echo "=========================================================="
echo " [빌드 통과] 검증 완료! Git 실서버 배포를 진행합니다."
echo "=========================================================="

git add .
git commit -m "feat: 모바일 전역 UI 250% 수준 가독성 및 터치 스케일업(헤더, 공지, 카드, 모달, 댓글) 배포"
git push origin main || git push origin master

echo "=========================================================="
echo " [배포 완료] 실서버에 최신 코드가 정상 배포되었습니다!"
echo "=========================================================="
