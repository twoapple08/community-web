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

export function getEulReul(word: string): string {
  const clean = (word || '').trim().replace(/['"“”]/g, '');
  const lastChar = clean[clean.length - 1] || '';
  return hasJongseong(lastChar) ? '을' : '를';
}

export function getYiGa(word: string): string {
  const clean = (word || '').trim().replace(/['"“”]/g, '');
  const lastChar = clean[clean.length - 1] || '';
  return hasJongseong(lastChar) ? '이' : '가';
}

export function getEuroRo(word: string): string {
  const clean = (word || '').trim().replace(/['"“”]/g, '');
  const lastChar = clean[clean.length - 1] || '';
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
