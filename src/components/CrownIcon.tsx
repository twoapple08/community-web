'use client'

export type RoleType = "creator" | "super_admin" | "admin" | null | undefined;

interface CrownIconProps {
  role: RoleType;
  className?: string;
}

export function CrownIcon({ role, className = "w-4 h-4" }: CrownIconProps) {
  if (!role || (role !== "creator" && role !== "super_admin" && role !== "admin")) {
    return null;
  }

  const isCreator = role === "creator";
  const isSuperAdmin = role === "super_admin";

  const fillColor = isCreator ? "#EF4444" : isSuperAdmin ? "#F59E0B" : "#FFFFFF";
  const strokeColor = isCreator ? "#DC2626" : isSuperAdmin ? "#D97706" : "#A1A1AA";
  const titleText = isCreator ? "제작자" : isSuperAdmin ? "최고관리자" : "관리자";

  return (
    <svg
      viewBox="0 0 24 24"
      className={`inline-block shrink-0 align-middle ${className}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{titleText}</title>
      <path
        d="M3 16L4.5 6L8.5 11L12 3L15.5 11L19.5 6L21 16H3Z"
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <rect
        x="3"
        y="17"
        width="18"
        height="3"
        rx="1"
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth="1.2"
      />
      <circle cx="4.5" cy="5.5" r="1.2" fill={fillColor} stroke={strokeColor} strokeWidth="0.8" />
      <circle cx="12" cy="2.5" r="1.5" fill={fillColor} stroke={strokeColor} strokeWidth="0.8" />
      <circle cx="19.5" cy="5.5" r="1.2" fill={fillColor} stroke={strokeColor} strokeWidth="0.8" />
    </svg>
  );
}
