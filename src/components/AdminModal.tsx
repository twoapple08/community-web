"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { CrownIcon, RoleType } from "./CrownIcon";
import { X, UserPlus, Trash2 } from "lucide-react";

export function AdminModal({
  isOpen,
  onClose,
  currentUserRole,
}: {
  isOpen: boolean;
  onClose: () => void;
  currentUserRole: RoleType;
}) {
  const [admins, setAdmins] = useState<{ email: string; role: RoleType }[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [selectedRole, setSelectedRole] = useState<"super_admin" | "admin">("admin");
  const [loading, setLoading] = useState(false);

  const fetchAdmins = async () => {
    const { data } = await supabase.from("user_roles").select("email, role");
    if (data) setAdmins(data as any);
  };

  useEffect(() => {
    if (isOpen) fetchAdmins();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) return;
    setLoading(true);
    await supabase.from("user_roles").upsert({
      email: newEmail.trim().toLowerCase(),
      role: selectedRole,
    });
    setNewEmail("");
    await fetchAdmins();
    setLoading(false);
  };

  const handleDelete = async (email: string) => {
    if (email === "iwsamuel08@gmail.com") {
      alert("사이트 제작자는 해제할 수 없습니다.");
      return;
    }
    if (!confirm(`${email} 계정의 관리자 권한을 해제하시겠습니까?`)) return;
    await supabase.from("user_roles").delete().eq("email", email);
    await fetchAdmins();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center justify-between pb-4 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <CrownIcon role={currentUserRole} className="w-5 h-5" />
            <h2 className="font-bold text-lg text-zinc-900 dark:text-white">관리자 지정 및 관리</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleAdd} className="mt-4 flex flex-col gap-2.5">
          <label className="text-xs font-semibold text-zinc-500">새 관리자 등록 (구글 이메일)</label>
          <div className="flex gap-2">
            <input
              type="email"
              required
              placeholder="user@gmail.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="flex-1 px-3 py-2 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            {currentUserRole === "creator" && (
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as any)}
                className="px-2 py-2 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white"
              >
                <option value="admin">일반관리자</option>
                <option value="super_admin">최고관리자</option>
              </select>
            )}
            <button
              type="submit"
              disabled={loading}
              className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg flex items-center gap-1 shrink-0"
            >
              <UserPlus className="w-4 h-4" /> 지정
            </button>
          </div>
        </form>

        <div className="mt-5">
          <h3 className="text-xs font-semibold text-zinc-500 mb-2">등록된 관리자 목록</h3>
          <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-1">
            {admins.map((adm) => (
              <div
                key={adm.email}
                className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-100 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/50"
              >
                <div className="flex items-center gap-2 truncate">
                  <CrownIcon role={adm.role} className="w-4 h-4" />
                  <span className="text-xs text-zinc-800 dark:text-zinc-200 truncate">{adm.email}</span>
                </div>
                {adm.email !== "iwsamuel08@gmail.com" &&
                  (currentUserRole === "creator" || (currentUserRole === "super_admin" && adm.role === "admin")) && (
                    <button
                      onClick={() => handleDelete(adm.email)}
                      className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded transition"
                      title="해제"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
