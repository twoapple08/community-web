export function hasJongseong(char: string): boolean {
  if (!char) return false;
  const code = char.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) {
    const lastChar = char.toLowerCase();
    return ['1', '3', '6', '7', '8', '0', 'l', 'm', 'n', 'r'].includes(lastChar);
  }
  return (code - 0xac00) % 28 !== 0;
}

export function isRieulJongseong(char: string): boolean {
  if (!char) return false;
  const code = char.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) {
    return (code - 0xac00) % 28 === 8;
  }
  return ['l', 'r'].includes(char.toLowerCase());
}

// 조사 판단용 마지막 글자: 끝에 붙은 괄호/따옴표/말줄임표/문장부호는 건너뜀
// (예: "[클랜 피드 / 제목]" → '목' 기준으로 '을', 예전에는 ']' 때문에 항상 '를'로 붙던 문제)
function lastSpokenChar(word: string): string {
  const chars = Array.from((word || '').trim());
  for (let i = chars.length - 1; i >= 0; i--) {
    if (/[0-9A-Za-z가-힣]/.test(chars[i])) return chars[i];
  }
  return '';
}

export function getEulReul(word: string): string {
  return hasJongseong(lastSpokenChar(word)) ? '을' : '를';
}

export function getYiGa(word: string): string {
  return hasJongseong(lastSpokenChar(word)) ? '이' : '가';
}

export function getEuroRo(word: string): string {
  const lastChar = lastSpokenChar(word);
  if (!hasJongseong(lastChar) || isRieulJongseong(lastChar)) {
    return '로';
  }
  return '으로';
}

export function formatReportNotice(reporterNick: string, feedLabel: string, postTitle: string, reason: string): string {
  const target = `[${feedLabel} / ${postTitle}]`;
  const eulReul = getEulReul(target);
  const euroRo = getEuroRo(reason);
  return `${reporterNick}님이 ${target}${eulReul} ${reason}${euroRo} 신고하셨습니다.`;
}

export function formatAutoDeleteNotice(feedLabel: string, postTitle: string, reason: string): string {
  const target = `[${feedLabel} / ${postTitle}]`;
  const yiGa = getYiGa(target);
  const euroRo = getEuroRo(reason);
  return `${target}${yiGa} ${reason}${euroRo} 3회 누적 신고가 되어 자동 삭제되었습니다.`;
}

// 알림 문구용 댓글 미리보기 (줄바꿈 정리 + 길면 말줄임, 이모지가 반으로 잘리지 않도록 글자 단위로 자름)
function shortPreview(text: string | null | undefined, max = 30): string {
  const chars = Array.from((text || '').replace(/\s+/g, ' ').trim());
  if (chars.length === 0) return '';
  return chars.length > max ? `${chars.slice(0, max).join('').trimEnd()}…` : chars.join('');
}

function commentLabel(commentPreview?: string | null): string {
  const preview = shortPreview(commentPreview);
  return preview ? `댓글 "${preview}"` : '댓글';
}

/** 댓글 신고 접수 알림: OO님이 [피드 / 제목]의 댓글 "미리보기"를 욕설로 신고하셨습니다. */
export function formatCommentReportNotice(
  reporterNick: string,
  feedLabel: string,
  postTitle: string,
  commentPreview: string | null | undefined,
  reason: string
): string {
  const target = `[${feedLabel} / ${postTitle}]`;
  const comment = commentLabel(commentPreview);
  return `${reporterNick}님이 ${target}의 ${comment}${getEulReul(comment)} ${reason}${getEuroRo(reason)} 신고하셨습니다.`;
}

/** 3회 누적 신고 → 임시 숨김 + 관리자 심사 필요 알림 (게시글/댓글 공용) */
export function formatReviewRequiredNotice(
  feedLabel: string,
  postTitle: string,
  reason: string | null | undefined,
  targetType: 'post' | 'comment',
  commentPreview?: string | null
): string {
  const target = `[${feedLabel} / ${postTitle}]`;
  const subject = targetType === 'comment' ? `${target}의 ${commentLabel(commentPreview)}` : target;
  const cleanReason = (reason || '').trim();
  const why = cleanReason ? `${cleanReason} 사유로 ` : '';
  return `${subject}${getYiGa(subject)} ${why}3회 누적 신고되어 임시로 가려졌습니다. 관리자 심사가 필요합니다.`;
}
