import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 기본 보안 헤더 (화면/동작 변화 없음)
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // 다른 사이트가 우리 사이트를 몰래 iframe 으로 띄워 클릭을 유도하는 공격(클릭재킹) 차단
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // 외부 링크로 이동할 때 주소의 경로/쿼리를 넘기지 않음
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
