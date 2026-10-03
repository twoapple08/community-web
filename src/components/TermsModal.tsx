'use client'

import { useState } from 'react'
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
    const { error } = await supabase
      .from('profiles')
      .update({ terms_agreed: true })
      .eq('id', userId)

    if (!error) {
      onAgreed()
    } else {
      alert(`약관 동의 처리 실패: ${error.message}`)
    }
    setLoading(false)
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div
        className="w-full max-w-lg bg-zinc-950 border-2 border-white text-white rounded-none p-6 shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-zinc-800 pb-3">
          <div className="p-1.5 bg-white text-black">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <h2 className="text-base font-black tracking-wide">커뮤니티 서비스 이용약관</h2>
        </div>

        <div className="p-4 bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 space-y-3 max-h-72 overflow-y-auto leading-relaxed select-none">
          <p className="font-bold text-white">제1조 (목적 및 커뮤니티 건전성 유지)</p>
          <p>
            본 약관은 사용자가 안전하고 쾌적한 환경에서 게시글을 작성하고 소통할 수 있도록 규정합니다.
          </p>

          <p className="font-bold text-white">제2조 (금지 행위 및 게시물 규제)</p>
          <p>다음 각 호에 해당하는 행위는 엄격히 금지됩니다:</p>
          <ul className="list-disc list-inside space-y-1 pl-1 text-zinc-400">
            <li><strong className="text-zinc-200">부적절한 이미지</strong>: 선정성 노출 이미지, 잔혹하거나 폭력적인 이미지</li>
            <li><strong className="text-zinc-200">부적절한 내용</strong>: 타인에 대한 욕설, 비하 및 혐오 발언</li>
            <li>동일 또는 유사한 내용의 반복적 도배 게시 행위</li>
          </ul>

          <p className="font-bold text-white">제3조 (신고 및 게시물 자동 삭제 조치)</p>
          <p>
            1. 게시글은 사용자 신고를 통해 접수되며, 동일한 사유(선정성/폭력성 이미지, 욕설, 혐오 발언, 도배)로 <strong>3회 누적 신고</strong> 시 해당 게시글은 별도 경고 없이 시스템에 의해 <strong>즉시 자동 영구 삭제</strong>됩니다.
          </p>

          <p className="font-bold text-white">제4조 (영구 블랙리스트 제재)</p>
          <p>
            1. 동일 유저의 게시글이 누적 신고로 인해 <strong>3회 이상 삭제</strong>된 경우, 해당 계정은 <strong>영구 블랙리스트</strong>로 자동 전환됩니다.
            <br />
            2. 블랙리스트로 등록된 사용자는 게시글 작성 기능이 영구히 차단됩니다.
          </p>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
          <label className="flex items-center gap-2.5 text-xs font-bold text-white cursor-pointer select-none">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="w-4 h-4 rounded-none border border-white bg-black accent-white cursor-pointer"
            />
            <span>위 이용약관을 모두 확인하였으며 이에 동의합니다.</span>
          </label>

          <button
            type="button"
            disabled={!agreed || loading}
            onClick={handleConfirm}
            className="px-5 py-2 text-xs font-black bg-white text-black hover:bg-zinc-200 transition disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            <span>{loading ? '처리 중...' : '확인'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
