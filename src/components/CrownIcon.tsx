import React from "react";
export type RoleType = "creator" | "super_admin" | "admin" | null | undefined;

export function CrownIcon({ role, className = "w-4 h-4" }: { role: RoleType; className?: string }) {
  if (!role) return null;
  let color = "#EF4444";
  let title = "사이트 제작자";
  if (role === "super_admin") {
    color = "#F59E0B";
    title = "최고관리자";
  } else if (role === "admin") {
    color = "#FFFFFF";
    title = "일반관리자";
  }

  return (
    <span className="inline-flex items-center justify-center shrink-0 mr-1" title={title}>
      <svg
        viewBox="0 0 24 24"
        fill={color}
        stroke="#18181b"
        strokeWidth="1.5"
        className={`drop-shadow-sm ${className}`}
        style={{ filter: role === "admin" ? "drop-shadow(0 1px 2px rgba(0,0,0,0.6))" : undefined }}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 18h18v2H3v-2zm1.5-3l2.5-7.5L12 12l5-4.5 2.5 7.5H4.5z"
        />
      </svg>
    </span>
  );
}
