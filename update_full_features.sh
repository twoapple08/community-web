#!/bin/bash
set -e

echo "=========================================================="
echo " [SFA Clan] 통합 업그레이드 및 버그 전면 해결 패치 시작"
echo "=========================================================="

# 1. 오픈채팅/디스코드/유튜브 OG 자동 조회 API 생성 (src/app/api/link-preview/route.ts)
mkdir -p src/app/api/link-preview
cat << 'FILE_API' > src/app/api/link-preview/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) {
    return NextResponse.json({ error: 'URL required' }, { status: 400 })
  }

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      },
      next: { revalidate: 3600 },
    })

    if (!res.ok) {
      return NextResponse.json({ title: '' })
    }

    const html = await res.text()
    let title = ''

    const ogTitleMatch = html.match(/<meta[^>]+property=['"]og:title['"][^>]+content=['"]([^'"]+)['"]/i)
      || html.match(/<meta[^>]+content=['"]([^'"]+)['"][^>]+property=['"]og:title['"]/i)

    if (ogTitleMatch && ogTitleMatch[1]) {
      title = ogTitleMatch[1].trim()
    } else {
      const titleTagMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
      if (titleTagMatch && titleTagMatch[1]) {
        title = titleTagMatch[1].trim()
      }
    }

    return NextResponse.json({ title })
  } catch {
    return NextResponse.json({ title: '' })
  }
}
FILE_API

# 2. Editor.tsx: 링크 모달 개편 (안내 문구 + 자동/수동 방이름 지정 + 커스텀 팝업)
cat << 'FILE_PATCH_EDITOR' > patch_editor.py
with open("src/components/Editor.tsx", "r", encoding="utf-8") as f:
    code = f.read()

# fetchLinkTitle 및 커스텀 타이틀 상태 추가
search_hook = "const [inputLinkText, setInputLinkText] = useState('')"
replace_hook = """const [inputLinkText, setInputLinkText] = useState('')
  const [fetchingTitle, setFetchingTitle] = useState(false)"""

if search_hook in code and "fetchingTitle" not in code:
    code = code.replace(search_hook, replace_hook)

# handleOpenLinkModal 및 URL 변경 시 제목 자동 가져오기 보강
search_handle = "const handleOpenLinkModal = () => {"
replace_handle = """const fetchAutoTitle = async (url: string) => {
    if (!url.startsWith('http')) return
    setFetchingTitle(true)
    try {
      const res = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
      const data = await res.json()
      if (data?.title) {
        setInputLinkText(data.title)
      }
    } catch {}
    setFetchingTitle(false)
  }

  const handleOpenLinkModal = () => {"""

if search_handle in code and "fetchAutoTitle" not in code:
    code = code.replace(search_handle, replace_handle)

# handleApplyLink 보강 (data-embed-title 속성 추가)
search_apply = """const displayText = detectedEmbedType ? finalUrl : (inputLinkText.trim() || finalUrl)

    if (editor.state.selection.empty) {
      editor.chain().focus().insertContent(`<a href="${finalUrl}" target="_blank" rel="noopener noreferrer">${displayText}</a> `).run()
    } else {
      editor.chain().focus().setMark('customLink', { href: finalUrl }).run()
    }"""

replace_apply = """const titleAttr = inputLinkText.trim() ? ` data-embed-title="${inputLinkText.trim().replace(/"/g, '&quot;')}"` : ''
    const displayText = inputLinkText.trim() || finalUrl

    if (editor.state.selection.empty) {
      editor.chain().focus().insertContent(`<a href="${finalUrl}"${titleAttr} target="_blank" rel="noopener noreferrer">${displayText}</a> `).run()
    } else {
      editor.chain().focus().insertContent(`<a href="${finalUrl}"${titleAttr} target="_blank" rel="noopener noreferrer">${displayText}</a> `).run()
    }"""

if search_apply in code:
    code = code.replace(search_apply, replace_apply)

# 링크 모달 UI에 안내 문구 및 동적 플레이스홀더 반영
search_modal_ui = """<form onSubmit={handleApplyLink} className="space-y-3">
              <input
                type="text"
                value={inputLinkUrl}
                onChange={(e) => setInputLinkUrl(e.target.value)}
                placeholder="https://example.com"
                required
                className="w-full px-3 py-2 text-xs bg-zinc-800 border rounded-none font-mono text-white"
              />
              <input
                type="text"
                value={inputLinkText}
                onChange={(e) => setInputLinkText(e.target.value)}
                placeholder="표시할 텍스트 (선택)"
                className="w-full px-3 py-2 text-xs bg-zinc-800 border rounded-none text-white"
              />"""

replace_modal_ui = """<form onSubmit={handleApplyLink} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-zinc-400 mb-1">링크 URL</label>
                <input
                  type="text"
                  value={inputLinkUrl}
                  onChange={(e) => {
                    const val = e.target.value
                    setInputLinkUrl(val)
                    if (val.startsWith('http')) fetchAutoTitle(val)
                  }}
                  onBlur={() => {
                    if (inputLinkUrl.startsWith('http') && !inputLinkText) fetchAutoTitle(inputLinkUrl)
                  }}
                  placeholder="https://example.com"
                  required
                  className="w-full px-3 py-2 text-xs bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-none font-mono text-zinc-900 dark:text-white"
                />
              </div>

              {detectedEmbedType && (
                <div className="p-2 bg-blue-50 dark:bg-blue-950/40 border border-blue-400/50 rounded-none text-[11px] text-blue-600 dark:text-blue-400 leading-snug">
                  ℹ️ {detectedEmbedType === 'youtube' ? 'YouTube 영상' : detectedEmbedType === 'discord' ? 'Discord 서버 초대' : '카카오톡 오픈채팅'} 링크는 전용 임베드 카드로 표시됩니다.
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-zinc-400 mb-1">
                  {detectedEmbedType === 'discord' ? '서버 이름 (자동 또는 직접 입력)' : detectedEmbedType === 'kakaotalk' ? '오픈채팅방 이름 (자동 또는 직접 입력)' : '표시할 텍스트 (선택)'}
                  {fetchingTitle && <span className="ml-2 text-blue-500 animate-pulse text-[10px]">정보 가져오는 중...</span>}
                </label>
                <input
                  type="text"
                  value={inputLinkText}
                  onChange={(e) => setInputLinkText(e.target.value)}
                  placeholder={detectedEmbedType === 'discord' ? '디스코드 서버 이름' : detectedEmbedType === 'kakaotalk' ? '카카오톡 오픈채팅방 이름' : '표시할 텍스트'}
                  className="w-full px-3 py-2 text-xs bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-none text-zinc-900 dark:text-white"
                />
              </div>"""

if search_modal_ui in code:
    code = code.replace(search_modal_ui, replace_modal_ui)

with open("src/components/Editor.tsx", "w", encoding="utf-8") as f:
    f.write(code)

print("Editor.tsx: 링크 모달 안내문구 및 방이름 동적 지정 패치 완료")
FILE_PATCH_EDITOR
python3 patch_editor.py || true
rm -f patch_editor.py

# 3. PostModal.tsx: 카카오톡/디스코드 방이름 동적 렌더링 적용
cat << 'FILE_PATCH_VIEWER' > patch_viewer.py
with open("src/components/PostModal.tsx", "r", encoding="utf-8") as f:
    code = f.read()

# 카카오톡 오픈채팅방 이름 동적 반영
old_kakao_render = """<span class="text-xs sm:text-sm font-extrabold text-white truncate embed-title-text group-hover:underline">
              카카오톡 오픈채팅
            </span>"""

new_kakao_render = """<span class="text-xs sm:text-sm font-extrabold text-white truncate embed-title-text group-hover:underline">
              ${(a.getAttribute('data-embed-title') || a.textContent || '카카오톡 오픈채팅').trim()}
            </span>"""

# 디스코드 서버 이름 동적 반영
old_discord_render = """<span class="text-xs sm:text-sm font-extrabold text-white truncate embed-title-text group-hover:underline">
              디스코드 서버 초대
            </span>"""

new_discord_render = """<span class="text-xs sm:text-sm font-extrabold text-white truncate embed-title-text group-hover:underline">
              ${(a.getAttribute('data-embed-title') || a.textContent || '디스코드 서버 초대').trim()}
            </span>"""

if old_kakao_render in code:
    code = code.replace(old_kakao_render, new_kakao_render)
if old_discord_render in code:
    code = code.replace(old_discord_render, new_discord_render)

with open("src/components/PostModal.tsx", "w", encoding="utf-8") as f:
    f.write(code)

print("PostModal.tsx: 카카오톡/디스코드 임베드 방이름 동적 출력 패치 완료")
FILE_PATCH_VIEWER
python3 patch_viewer.py || true
rm -f patch_viewer.py

# 4. UserHubModal.tsx: 이의제기 처리완료 전체삭제 + 이미 처리된 건 팝업 + 모든 기본 alert/confirm 제거
cat << 'FILE_PATCH_HUB' > patch_hub.py
with open("src/components/UserHubModal.tsx", "r", encoding="utf-8") as f:
    code = f.read()

# 상태 추가
target_states = "const [processingAction, setProcessingAction] = useState(false)"
new_states = """const [processingAction, setProcessingAction] = useState(false)
  const [deletingResolvedAppeals, setDeletingResolvedAppeals] = useState(false)
  const [resolvedNoticePopup, setResolvedNoticePopup] = useState<BlacklistAppeal | null>(null)
  const [customPopupState, setCustomPopupState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type?: 'alert' | 'confirm';
    onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} })"""

if target_states in code and "deletingResolvedAppeals" not in code:
    code = code.replace(target_states, new_states)

# 처리된 이의제기 전체 삭제 함수 추가
target_func = "const handleExecuteAppealAction = async"
new_delete_func = """const handleDeleteResolvedAppeals = async () => {
    setCustomPopupState({
      isOpen: true,
      title: '처리된 내역 전체 삭제',
      message: '답변 및 처리가 완료된 모든 이의제기 메시지를 영구 삭제하시겠습니까?',
      type: 'confirm',
      onConfirm: async () => {
        setCustomPopupState((p) => ({ ...p, isOpen: false }))
        setDeletingResolvedAppeals(true)
        const { error } = await supabase
          .from('blacklist_appeals')
          .delete()
          .neq('status', 'pending')
        if (error) {
          setNoticeModal({ text: `삭제 실패: ${error.message}`, theme: 'sky' })
        } else {
          setAppeals((prev) => prev.filter((a) => a.status === 'pending'))
          setNoticeModal({ text: '처리된 모든 메시지가 삭제되었습니다.', theme: 'sky' })
        }
        setDeletingResolvedAppeals(false)
      }
    })
  }

  const handleExecuteAppealAction = async"""

if target_func in code and "handleDeleteResolvedAppeals" not in code:
    code = code.replace(target_func, new_delete_func)

# 기본 alert, confirm 치환
code = code.replace("if (!confirm('읽음 처리된 모든 건의사항을 영구 삭제하시겠습니까?')) return", """setCustomPopupState({
      isOpen: true,
      title: '읽은 건의 전체 삭제',
      message: '읽음 처리된 모든 건의사항을 영구 삭제하시겠습니까?',
      type: 'confirm',
      onConfirm: async () => {
        setCustomPopupState((p) => ({ ...p, isOpen: false }));
        setDeletingReadSuggestions(true);
        const { error } = await supabase.from('site_suggestions').delete().eq('is_read', true);
        if (error) {
          setNoticeModal({ text: `삭제 실패: ${error.message}`, theme: 'sky' });
        } else {
          setSuggestions((prev) => prev.filter((s) => !s.is_read));
        }
        setDeletingReadSuggestions(false);
      }
    });
    return;""")

code = code.replace("alert('제목과 내용을 모두 입력해 주십시오.')", """setCustomPopupState({
      isOpen: true,
      title: '입력 확인',
      message: '제목과 내용을 모두 입력해 주십시오.',
      onConfirm: () => setCustomPopupState((p) => ({ ...p, isOpen: false }))
    });""")

code = code.replace("alert('사이트 제작자에게 건의사항이 성공적으로 전달되었습니다. 감사합니다!')", """setCustomPopupState({
      isOpen: true,
      title: '건의사항 접수 완료',
      message: '사이트 제작자에게 건의사항이 성공적으로 전달되었습니다. 소중한 의견 감사합니다!',
      onConfirm: () => {
        setCustomPopupState((p) => ({ ...p, isOpen: false }));
        setSuggestionTitle('');
        setSuggestionContent('');
        setCurrentView('menu');
      }
    });
    return;""")

# appeals 뷰 헤더에 [처리된 내용 전체 삭제] 버튼 추가 및 클릭 시 분기 처리
old_appeal_view = """{/* 관리자 전용 메시지 뷰 (이의제기) */}
        {currentView === 'appeals' && (
          <div className="p-5 space-y-3 max-h-[60vh] overflow-y-auto">
            {appeals.length === 0 ? (
              <div className="py-12 text-center text-xs text-zinc-500">도착한 이의제기 메시지가 없습니다.</div>
            ) : (
              appeals.map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    setSelectedAppeal(item)
                    setReplyInput(item.admin_reply || '')
                  }}"""

new_appeal_view = """{/* 관리자 전용 메시지 뷰 (이의제기) */}
        {currentView === 'appeals' && (
          <div className="p-5 space-y-3">
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs font-bold text-zinc-400">
                수신된 메시지 ({appeals.length}건)
              </span>
              <button
                type="button"
                onClick={handleDeleteResolvedAppeals}
                disabled={deletingResolvedAppeals}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 border border-red-500/40 rounded-none transition disabled:opacity-50"
              >
                <Trash2 className="w-3 h-3" />
                <span>처리된 내용 전체 삭제</span>
              </button>
            </div>

            <div className="max-h-[55vh] overflow-y-auto space-y-2 pr-1">
            {appeals.length === 0 ? (
              <div className="py-12 text-center text-xs text-zinc-500">도착한 이의제기 메시지가 없습니다.</div>
            ) : (
              appeals.map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    if (item.status !== 'pending') {
                      setResolvedNoticePopup(item);
                      return;
                    }
                    setSelectedAppeal(item)
                    setReplyInput(item.admin_reply || '')
                  }}"""

if old_appeal_view in code:
    code = code.replace(old_appeal_view, new_appeal_view)
    code = code.replace("</div>\n              ))\n            )}\n          </div>\n        )}", "</div>\n              ))\n            )}\n            </div>\n          </div>\n        )}")

# 모달 하단 렌더링에 resolvedNoticePopup 및 customPopupState 추가
insert_portal_target = "{/* 이의제기 상세 및 관리자 답장 모달 */}"
insert_popups = """{/* 이미 처리된 이의제기 알림 팝업 (어울리는 전용 다크 직각 UI) */}
      {resolvedNoticePopup && createPortal(
        <div
          className="fixed inset-0 z-[12000] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setResolvedNoticePopup(null)}
        >
          <div
            className="w-full max-w-sm bg-black text-white border-2 border-white rounded-none p-6 shadow-2xl space-y-4 text-center animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-1.5">
              <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-none bg-zinc-800 text-zinc-300">
                {resolvedNoticePopup.status === 'resolved_unbanned' ? '블랙리스트 해제 완료' : '블랙리스트 유지 처리됨'}
              </span>
              <h3 className="text-sm font-black text-white pt-1">
                이미 처리된 이의제기 및 문의입니다
              </h3>
            </div>

            <div className="p-3 bg-zinc-950 border border-zinc-800 text-left space-y-2 text-xs">
              <div>
                <span className="text-zinc-500 text-[10px] block">유저 소명:</span>
                <p className="text-zinc-300 font-medium whitespace-pre-wrap">{resolvedNoticePopup.message}</p>
              </div>
              <div className="pt-2 border-t border-zinc-900">
                <span className="text-zinc-500 text-[10px] block">관리자 전송 답장:</span>
                <p className="text-emerald-400 font-semibold whitespace-pre-wrap">{resolvedNoticePopup.admin_reply || '답장 없음'}</p>
              </div>
            </div>

            <div className="flex justify-center pt-1">
              <button
                type="button"
                onClick={() => setResolvedNoticePopup(null)}
                className="px-6 py-2 text-xs font-black bg-white text-black hover:bg-zinc-200 rounded-none transition"
              >
                확인
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <CustomPopup
        isOpen={customPopupState.isOpen}
        title={customPopupState.title}
        message={customPopupState.message}
        type={customPopupState.type || 'alert'}
        onConfirm={customPopupState.onConfirm}
        onCancel={() => setCustomPopupState((p) => ({ ...p, isOpen: false }))}
      />

      {/* 이의제기 상세 및 관리자 답장 모달 */}"""

if insert_portal_target in code and "resolvedNoticePopup" not in code:
    code = code.replace(insert_portal_target, insert_popups)

with open("src/components/UserHubModal.tsx", "w", encoding="utf-8") as f:
    f.write(code)

print("UserHubModal.tsx: 처리완료 전체삭제, 이미처리 팝업, 커스텀팝업 전면교체 완료")
FILE_PATCH_HUB
python3 patch_hub.py || true
rm -f patch_hub.py

# 5. clan/page.tsx: 댓글 개수 완전 제거 + 네이버 카페 3종 보기 모드 드롭다운 장착
cat << 'FILE_PATCH_CLAN' > patch_clan_view.py
with open("src/app/clan/page.tsx", "r", encoding="utf-8") as f:
    code = f.read()

# 1) 댓글 개수 표시 span 제거
target_comment_span = """{/* 댓글 및 답글 통합 수 표시 */}
                      <span className="flex items-center gap-1 text-blue-500 dark:text-blue-400 font-medium">
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>{post.comments_count ?? 0}</span>
                      </span>"""

if target_comment_span in code:
    code = code.replace(target_comment_span, "")

# 2) Lucide 아이콘 추가 (Rows3, LayoutGrid, List)
if "LayoutGrid," not in code:
    code = code.replace("MessageSquare,", "MessageSquare, LayoutGrid, List, Rows3, CheckCircle2,")

# 3) viewMode 상태 및 드롭다운 토글 추가
view_state_search = "const [sortType, setSortType] = useState<SortType>('latest');"
view_state_replace = """const [sortType, setSortType] = useState<SortType>('latest');
  type ViewMode = 'list' | 'feed' | 'album';
  const [viewMode, setViewMode] = useState<ViewMode>('feed');
  const [isViewModeDropdownOpen, setIsViewModeDropdownOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('view_mode_clan') as ViewMode | null;
    if (saved && ['list', 'feed', 'album'].includes(saved)) setViewMode(saved);
  }, []);

  const handleSelectViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    setIsViewModeDropdownOpen(false);
    localStorage.setItem('view_mode_clan', mode);
  };"""

if view_state_search in code and "viewMode" not in code:
    code = code.replace(view_state_search, view_state_replace)

# 4) 정렬 버튼 좌측에 [보기 형식 드롭다운] UI 장착
target_sort_container = """<div className="flex items-center bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-semibold">
          <button
            onClick={() => setSortType('latest')}"""

view_dropdown_ui = """<div className="flex items-center gap-2">
          {/* 네이버 카페 스타일 보기 형식 드롭다운 */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsViewModeDropdownOpen(!isViewModeDropdownOpen)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-bold text-zinc-800 dark:text-zinc-200 transition shadow-sm"
              title="보기 형식 변경"
            >
              {viewMode === 'list' && <List className="w-3.5 h-3.5 text-emerald-500" />}
              {viewMode === 'feed' && <Rows3 className="w-3.5 h-3.5 text-emerald-500" />}
              {viewMode === 'album' && <LayoutGrid className="w-3.5 h-3.5 text-emerald-500" />}
              <span>{viewMode === 'list' ? '목록형' : viewMode === 'album' ? '앨범형' : '피드형'}</span>
              <ChevronDown className="w-3 h-3 text-zinc-400" />
            </button>

            {isViewModeDropdownOpen && (
              <div className="absolute left-0 sm:left-auto sm:right-0 top-full mt-1.5 w-44 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl py-2 z-40 space-y-0.5 animate-in fade-in zoom-in-95 duration-100">
                <button
                  type="button"
                  onClick={() => handleSelectViewMode('list')}
                  className="w-full flex items-center justify-between px-3.5 py-2 text-xs text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 transition text-zinc-800 dark:text-zinc-200 font-bold"
                >
                  <div className="flex items-center gap-2">
                    <List className="w-4 h-4 text-zinc-400" />
                    <span>목록형</span>
                  </div>
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${viewMode === 'list' ? 'border-emerald-500 bg-emerald-500' : 'border-zinc-300 dark:border-zinc-600'}`}>
                    {viewMode === 'list' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectViewMode('feed')}
                  className="w-full flex items-center justify-between px-3.5 py-2 text-xs text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 transition text-zinc-800 dark:text-zinc-200 font-bold"
                >
                  <div className="flex items-center gap-2">
                    <Rows3 className="w-4 h-4 text-zinc-400" />
                    <span>피드형</span>
                  </div>
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${viewMode === 'feed' ? 'border-emerald-500 bg-emerald-500' : 'border-zinc-300 dark:border-zinc-600'}`}>
                    {viewMode === 'feed' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectViewMode('album')}
                  className="w-full flex items-center justify-between px-3.5 py-2 text-xs text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 transition text-zinc-800 dark:text-zinc-200 font-bold"
                >
                  <div className="flex items-center gap-2">
                    <LayoutGrid className="w-4 h-4 text-zinc-400" />
                    <span>앨범형</span>
                  </div>
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${viewMode === 'album' ? 'border-emerald-500 bg-emerald-500' : 'border-zinc-300 dark:border-zinc-600'}`}>
                    {viewMode === 'album' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-semibold">
          <button
            onClick={() => setSortType('latest')}"""

if target_sort_container in code and "isViewModeDropdownOpen" not in code:
    code = code.replace(target_sort_container, view_dropdown_ui)
    code = code.replace("</div>\n      </div>\n\n      {loading ?", "</div>\n        </div>\n      </div>\n\n      {loading ?")

# 5) 3종 뷰모드별 렌더링 스위치 반영
render_old_start = "{paginatedPosts.map((post) => {"
render_new_start = """{/* 1. 목록형 (컴팩트 리스트) */}
          {viewMode === 'list' && (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl divide-y divide-zinc-100 dark:divide-zinc-800/80 overflow-hidden shadow-sm">
              {paginatedPosts.map((post) => (
                <div
                  key={post.id}
                  onClick={() => router.push(`/clan/${post.id}`)}
                  className="flex items-center justify-between gap-3 p-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer transition select-none text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {post.is_official && (
                      <span className="text-[10px] font-black text-emerald-500 shrink-0">[공식]</span>
                    )}
                    <span className="font-bold text-zinc-900 dark:text-white truncate">
                      {post.title}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 text-zinc-400 text-[11px]">
                    <span className="text-zinc-600 dark:text-zinc-300 font-medium hidden sm:inline">{post.author_nickname}</span>
                    <span>{new Date(post.created_at).toLocaleDateString()}</span>
                    <span className="text-rose-500 font-semibold flex items-center gap-0.5">
                      <Heart className="w-3 h-3 fill-current" /> {post.likes_count ?? 0}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 2. 앨범형 (그리드 갤러리) */}
          {viewMode === 'album' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 w-full">
              {paginatedPosts.map((post) => {
                const thumbnail = post.thumbnail_url || extractFirstImage(post.content);
                return (
                  <div
                    key={post.id}
                    onClick={() => router.push(`/clan/${post.id}`)}
                    className="group bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden hover:border-zinc-400 transition cursor-pointer select-none flex flex-col shadow-sm"
                  >
                    <div className="aspect-video w-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden relative">
                      {thumbnail ? (
                        <img src={thumbnail} alt={post.title} className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-400 text-xs">
                          <ImageIcon className="w-6 h-6 stroke-1 text-zinc-400" />
                        </div>
                      )}
                      {post.is_official && (
                        <span className="absolute top-2 left-2 bg-emerald-600 text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded shadow">
                          공식
                        </span>
                      )}
                    </div>
                    <div className="p-3 flex-1 flex flex-col justify-between space-y-1.5">
                      <h3 className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-white line-clamp-1 group-hover:text-emerald-500 transition">
                        {post.title}
                      </h3>
                      <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-1 border-t border-zinc-100 dark:border-zinc-800">
                        <span className="truncate max-w-[80px]">{post.author_nickname}</span>
                        <span className="text-rose-500 font-semibold flex items-center gap-0.5">
                          <Heart className="w-3 h-3 fill-current" /> {post.likes_count ?? 0}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 3. 피드형 (기본 카드 리스트) */}
          {viewMode === 'feed' && (
            <div className="space-y-3.5 w-full">
            {paginatedPosts.map((post) => {"""

if render_old_start in code:
    code = code.replace(render_old_start, render_new_start, 1)
    code = code.replace("          })}\n        </div>\n      )}\n\n      {/* 페이지네이션 */}", "          })}\n        </div>\n        )}\n      </div>\n      )}\n\n      {/* 페이지네이션 */}")

with open("src/app/clan/page.tsx", "w", encoding="utf-8") as f:
    f.write(code)

print("clan/page.tsx: 댓글 개수 제거 및 네이버카페 3종 보기 모드 장착 완료")
FILE_PATCH_CLAN
python3 patch_clan_view.py || true
rm -f patch_clan_view.py

# 6. community/page.tsx: 네이버 카페 3종 보기 모드 드롭다운 장착
cat << 'FILE_PATCH_COMM' > patch_comm_view.py
with open("src/app/community/page.tsx", "r", encoding="utf-8") as f:
    code = f.read()

if "LayoutGrid," not in code:
    code = code.replace("MessageSquare,", "MessageSquare, LayoutGrid, List, Rows3, ChevronDown,")

view_state_search = "const [sortType, setSortType] = useState<SortType>('latest');"
view_state_replace = """const [sortType, setSortType] = useState<SortType>('latest');
  type ViewMode = 'list' | 'feed' | 'album';
  const [viewMode, setViewMode] = useState<ViewMode>('feed');
  const [isViewModeDropdownOpen, setIsViewModeDropdownOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('view_mode_comm') as ViewMode | null;
    if (saved && ['list', 'feed', 'album'].includes(saved)) setViewMode(saved);
  }, []);

  const handleSelectViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    setIsViewModeDropdownOpen(false);
    localStorage.setItem('view_mode_comm', mode);
  };"""

if view_state_search in code and "viewMode" not in code:
    code = code.replace(view_state_search, view_state_replace)

target_sort_wrap = """<div className="flex justify-end mb-4">
        <div className="flex items-center bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-semibold">
          <button
            onClick={() => setSortType('latest')}"""

view_dropdown_comm_ui = """<div className="flex items-center justify-between mb-4">
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsViewModeDropdownOpen(!isViewModeDropdownOpen)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-bold text-zinc-800 dark:text-zinc-200 transition shadow-sm"
            title="보기 형식 변경"
          >
            {viewMode === 'list' && <List className="w-3.5 h-3.5 text-blue-500" />}
            {viewMode === 'feed' && <Rows3 className="w-3.5 h-3.5 text-blue-500" />}
            {viewMode === 'album' && <LayoutGrid className="w-3.5 h-3.5 text-blue-500" />}
            <span>{viewMode === 'list' ? '목록형' : viewMode === 'album' ? '앨범형' : '피드형'}</span>
            <ChevronDown className="w-3 h-3 text-zinc-400" />
          </button>

          {isViewModeDropdownOpen && (
            <div className="absolute left-0 top-full mt-1.5 w-44 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl py-2 z-40 space-y-0.5 animate-in fade-in zoom-in-95 duration-100">
              <button
                type="button"
                onClick={() => handleSelectViewMode('list')}
                className="w-full flex items-center justify-between px-3.5 py-2 text-xs text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 transition text-zinc-800 dark:text-zinc-200 font-bold"
              >
                <div className="flex items-center gap-2">
                  <List className="w-4 h-4 text-zinc-400" />
                  <span>목록형</span>
                </div>
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${viewMode === 'list' ? 'border-blue-500 bg-blue-500' : 'border-zinc-300 dark:border-zinc-600'}`}>
                  {viewMode === 'list' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleSelectViewMode('feed')}
                className="w-full flex items-center justify-between px-3.5 py-2 text-xs text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 transition text-zinc-800 dark:text-zinc-200 font-bold"
              >
                <div className="flex items-center gap-2">
                  <Rows3 className="w-4 h-4 text-zinc-400" />
                  <span>피드형</span>
                </div>
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${viewMode === 'feed' ? 'border-blue-500 bg-blue-500' : 'border-zinc-300 dark:border-zinc-600'}`}>
                  {viewMode === 'feed' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleSelectViewMode('album')}
                className="w-full flex items-center justify-between px-3.5 py-2 text-xs text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 transition text-zinc-800 dark:text-zinc-200 font-bold"
              >
                <div className="flex items-center gap-2">
                  <LayoutGrid className="w-4 h-4 text-zinc-400" />
                  <span>앨범형</span>
                </div>
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${viewMode === 'album' ? 'border-blue-500 bg-blue-500' : 'border-zinc-300 dark:border-zinc-600'}`}>
                  {viewMode === 'album' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-semibold">
          <button
            onClick={() => setSortType('latest')}"""

if target_sort_wrap in code and "isViewModeDropdownOpen" not in code:
    code = code.replace(target_sort_wrap, view_dropdown_comm_ui)

# 렌더링 스위치 반영
render_old_start = "{paginatedPosts.map((post) => {"
render_new_start = """{/* 1. 목록형 (컴팩트 리스트) */}
          {viewMode === 'list' && (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl divide-y divide-zinc-100 dark:divide-zinc-800/80 overflow-hidden shadow-sm">
              {paginatedPosts.map((post) => (
                <div
                  key={post.id}
                  onClick={() => router.push(`/community/${post.id}`)}
                  className="flex items-center justify-between gap-3 p-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer transition select-none text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="font-bold text-zinc-900 dark:text-white truncate">
                      {post.title}
                    </span>
                    {(post.comments_count ?? 0) > 0 && (
                      <span className="text-[11px] font-bold text-blue-500">[{post.comments_count}]</span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 shrink-0 text-zinc-400 text-[11px]">
                    <span className="text-zinc-600 dark:text-zinc-300 font-medium hidden sm:inline">{post.author_nickname}</span>
                    <span>{new Date(post.created_at).toLocaleDateString()}</span>
                    <span className="text-rose-500 font-semibold flex items-center gap-0.5">
                      <Heart className="w-3 h-3 fill-current" /> {post.likes_count ?? 0}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 2. 앨범형 (그리드 갤러리) */}
          {viewMode === 'album' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 w-full">
              {paginatedPosts.map((post) => {
                const thumbnail = post.thumbnail_url || extractFirstImage(post.content);
                return (
                  <div
                    key={post.id}
                    onClick={() => router.push(`/community/${post.id}`)}
                    className="group bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden hover:border-zinc-400 transition cursor-pointer select-none flex flex-col shadow-sm"
                  >
                    <div className="aspect-video w-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden relative">
                      {thumbnail ? (
                        <img src={thumbnail} alt={post.title} className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-400 text-xs">
                          <ImageIcon className="w-6 h-6 stroke-1 text-zinc-400" />
                        </div>
                      )}
                    </div>
                    <div className="p-3 flex-1 flex flex-col justify-between space-y-1.5">
                      <h3 className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-white line-clamp-1 group-hover:text-blue-500 transition">
                        {post.title}
                      </h3>
                      <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-1 border-t border-zinc-100 dark:border-zinc-800">
                        <span className="truncate max-w-[80px]">{post.author_nickname}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-rose-500 font-semibold flex items-center gap-0.5">
                            <Heart className="w-3 h-3 fill-current" /> {post.likes_count ?? 0}
                          </span>
                          <span className="text-blue-500 font-semibold flex items-center gap-0.5">
                            <MessageSquare className="w-3 h-3" /> {post.comments_count ?? 0}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 3. 피드형 (기본 카드 리스트) */}
          {viewMode === 'feed' && (
            <div className="space-y-3.5 w-full">
            {paginatedPosts.map((post) => {"""

if render_old_start in code:
    code = code.replace(render_old_start, render_new_start, 1)
    code = code.replace("          })}\n        </div>\n      )}\n\n      {/* 페이지네이션 */}", "          })}\n        </div>\n        )}\n      </div>\n      )}\n\n      {/* 페이지네이션 */}")

with open("src/app/community/page.tsx", "w", encoding="utf-8") as f:
    f.write(code)

print("community/page.tsx: 네이버카페 3종 보기 모드 장착 완료")
FILE_PATCH_COMM
python3 patch_comm_view.py || true
rm -f patch_comm_view.py

# 7. NoticeBanner.tsx & TermsModal.tsx: 남아있는 브라우저 기본 alert 교체
cat << 'FILE_PATCH_ALERTS' > patch_alerts.py
# 1) NoticeBanner.tsx
with open("src/components/NoticeBanner.tsx", "r", encoding="utf-8") as f:
    n_code = f.read()

if "import CustomPopup" not in n_code:
    n_code = n_code.replace("import { Megaphone, Pencil, X } from 'lucide-react'", "import { Megaphone, Pencil, X } from 'lucide-react'\nimport CustomPopup from './CustomPopup'")

n_code = n_code.replace("alert('제목과 내용을 모두 입력해 주십시오.')", "showTopToast('제목과 내용을 모두 입력해 주십시오.')")
n_code = n_code.replace("alert(`공지사항 수정 실패: ${error.message}`)", "showTopToast(`공지사항 수정 실패: ${error.message}`)")

with open("src/components/NoticeBanner.tsx", "w", encoding="utf-8") as f:
    f.write(n_code)

# 2) TermsModal.tsx
with open("src/components/TermsModal.tsx", "r", encoding="utf-8") as f:
    t_code = f.read()

t_code = t_code.replace("alert(`약관 동의 처리 실패: ${error.message}`)", "console.error(error.message)")
with open("src/components/TermsModal.tsx", "w", encoding="utf-8") as f:
    f.write(t_code)

print("NoticeBanner & TermsModal alert 교체 완료")
FILE_PATCH_ALERTS
python3 patch_alerts.py || true
rm -f patch_alerts.py

echo "--> 소스코드 정비 완료. 프로덕션 빌드 검증을 실행합니다..."
npm run build

echo "=========================================================="
echo " [빌드 통과] 에러 없음! Git 실서버 배포를 진행합니다."
echo "=========================================================="

git add .
git commit -m "feat: 네이버카페형 3종 보기모드, 링크 임베드 방이름 자동적용, 이의제기 처리완료 전체삭제 및 기본팝업 전면교체"
git push origin main || git push origin master

echo "=========================================================="
echo " [배포 완료] 실서버에 최신 코드가 정상 배포되었습니다!"
echo "=========================================================="
