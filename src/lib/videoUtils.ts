// 업로드할 동영상의 첫 장면을 JPG 로 추출 (목록·썸네일 미리보기용 poster)
// - 일부 기기(iOS 등)·코덱에서 seeked 가 오지 않아 업로드가 멈추던 문제 → 시간 제한 후 포스터 없이 진행
const CAPTURE_TIMEOUT_MS = 8000

export async function captureVideoFirstFrame(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    const url = URL.createObjectURL(file);
    let settled = false;

    const finish = (blob: Blob | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
      resolve(blob);
    };

    const timer = window.setTimeout(() => finish(null), CAPTURE_TIMEOUT_MS);

    // 첫 프레임 디코딩을 위해 0.05초(아주 짧은 영상이면 중간) 시점으로 이동
    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      video.currentTime = duration > 0 ? Math.min(0.05, duration / 2) : 0.05;
    };

    video.onseeked = () => {
      try {
        if (!video.videoWidth || !video.videoHeight) {
          finish(null);
          return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          finish(null);
          return;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => finish(blob), 'image/jpeg', 0.85);
      } catch {
        finish(null);
      }
    };

    video.onerror = () => finish(null);
    video.src = url;
  });
}
