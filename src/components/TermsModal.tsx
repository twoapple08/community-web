'use client'

import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { ShieldCheck, Check } from 'lucide-react'

interface TermsModalProps {
  isOpen: boolean
  userId: string
  onAgreed: () => void
}

export default function TermsModal({ isOpen, userId, onAgreed }: TermsModalProps) {
  const [agreed, setAgreed] = useState(false)
  const [loading, setLoading] = useState(false)

  if (!isOpen) return null

  const handleConfirm = async () => {
    if (!agreed) return
    setLoading(true)

    // 신규 유저 레코드 부재 시에도 확실히 저장되도록 upsert 적용
    const { error } = await supabase
      .from('profiles')
      .upsert({ id: userId, terms_agreed: true }, { onConflict: 'id' })

    if (!error) {
      onAgreed()
    } else {
      console.error(error.message)
    }
    setLoading(false)
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div
        className="w-full max-w-lg bg-white dark:bg-zinc-950 border-2 border-zinc-900 dark:border-white text-zinc-900 dark:text-white rounded-none p-6 shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-zinc-200 dark:border-zinc-800 pb-3">
          <div className="p-1.5 bg-zinc-900 text-white dark:bg-white dark:text-black">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <h2 className="text-base font-black tracking-wide">커뮤니티 서비스 이용약관</h2>
        </div>

        <div className="p-4 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-700 dark:text-zinc-300 space-y-3 max-h-72 overflow-y-auto leading-relaxed select-none">
          <p className="font-bold text-zinc-900 dark:text-white">제1조 (목적 및 커뮤니티 건전성 유지)</p>
          <p>
            본 약관은 사용자가 안전하고 쾌적한 환경에서 게시글을 작성하고 소통할 수 있도록 규정합니다.
          </p>

          <p className="font-bold text-zinc-900 dark:text-white">제2조 (금지 행위 및 게시물 규제)</p>
          <p>다음 각 호에 해당하는 행위는 엄격히 금지됩니다:</p>
          <ul className="list-disc list-inside space-y-1 pl-1 text-zinc-600 dark:text-zinc-400">
            <li><strong className="text-zinc-800 dark:text-zinc-200">부적절한 이미지</strong>: 선정성 노출 이미지, 잔혹하거나 폭력적인 이미지</li>
            <li><strong className="text-zinc-800 dark:text-zinc-200">부적절한 내용</strong>: 타인에 대한 욕설, 비하 및 혐오 발언</li>
            <li>동일 또는 유사한 내용의 반복적 도배 게시 행위</li>
          </ul>

          <p className="font-bold text-zinc-900 dark:text-white">제3조 (신고 및 게시물 검토 조치)</p>
          <p>
            1. 게시글·댓글은 사용자 신고로 접수되며, <strong>서로 다른 이용자 3명 이상</strong>에게 신고되면 <strong>관리자 검토 전까지 임시로 가려집니다</strong>.
            <br />
            2. 관리자가 내용을 확인해 <strong>삭제</strong> 또는 <strong>복구(허위 신고 처리)</strong>를 결정합니다.
          </p>

          <p className="font-bold text-zinc-900 dark:text-white">제4조 (영구 블랙리스트 제재)</p>
          <p>
            1. 신고 검토 결과 동일 유저의 게시글이 <strong>3회 이상 삭제</strong>된 경우, 해당 계정은 <strong>영구 블랙리스트</strong>로 자동 전환됩니다.
            <br />
            2. 블랙리스트로 등록된 사용자는 게시글 작성 기능이 영구히 차단됩니다.
          </p>

          {/* 개인정보처리방침 안내 (새 탭으로 열어 약관 동의 창은 그대로 유지) */}
          <p className="pt-2 border-t border-zinc-200 dark:border-zinc-800 text-[11px] text-zinc-500 dark:text-zinc-400">
            개인정보 처리에 관한 사항은{' '}
            <Link
              href="/privacy"
              target="_blank"
              rel="noopener"
              className="font-bold text-zinc-900 dark:text-white underline underline-offset-2 hover:opacity-70 transition"
            >
              개인정보처리방침
            </Link>
            을 확인해 주세요.
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 pt-2 border-t border-zinc-200 dark:border-zinc-800">
          <label className="flex items-center gap-2.5 text-xs font-bold text-zinc-900 dark:text-white cursor-pointer select-none">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="w-4 h-4 shrink-0 rounded-none border border-zinc-900 dark:border-white bg-white dark:bg-black accent-zinc-900 dark:accent-white cursor-pointer"
            />
            <span>위 이용약관을 모두 확인하였으며 이에 동의합니다.</span>
          </label>

          <button
            type="button"
            disabled={!agreed || loading}
            onClick={handleConfirm}
            className="px-5 py-2 text-xs font-black bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200 transition disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5 shrink-0"
          >
            <Check className="w-4 h-4" />
            <span>{loading ? '처리 중...' : '확인'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
