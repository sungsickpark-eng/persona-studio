"use client";
// 헤더에 박아 쓰는 로그인/구독 배지. ThemeToggle과 같은 자리에 나란히 둔다(app/app/page.tsx, app/p/[id]/page.tsx).
// 클라우드 저장은 유료 기능이라 3단계로 나뉜다: 로그아웃 상태 / 로그인+미구독 / 로그인+구독중.
import { useState } from "react";
import Link from "next/link";
import { useAuth, useSubscription } from "@/components/AuthProvider";
import { PLANS } from "@/lib/pricing";
import LoginPicker from "@/components/LoginPicker";

export default function AuthBadge({ className = "" }: { className?: string }) {
  const { user, loading, isAdmin, signOut } = useAuth();
  const { status, plan, deactivateMockSubscription } = useSubscription();
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  if (loading) return null;

  const cancel = async () => {
    setBusy(true);
    try {
      await deactivateMockSubscription();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!user) {
    return (
      <div className={className}>
        <button
          onClick={() => setPickerOpen(true)}
          className="rounded-full border border-gray-200 px-2.5 py-1.5 text-xs transition hover:border-fuchsia-400 dark:border-gray-800"
        >
          로그인
        </button>
        {pickerOpen && <LoginPicker onClose={() => setPickerOpen(false)} />}
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-1.5 text-xs ${className}`}>
      <span className="max-w-[10rem] truncate text-gray-500 dark:text-gray-400" title={user.email ?? undefined}>
        {user.email}
      </span>
      {isAdmin && (
        <Link
          href="/admin"
          className="rounded-full border border-fuchsia-300 px-2.5 py-1 text-fuchsia-600 transition hover:bg-fuchsia-50 dark:border-fuchsia-800 dark:text-fuchsia-400 dark:hover:bg-fuchsia-950/30"
        >
          관리자
        </Link>
      )}
      {status === "active" ? (
        <>
          <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
            구독 중{plan && ` · ${PLANS[plan].label}`}
          </span>
          <button onClick={cancel} disabled={busy} className="text-gray-400 underline hover:text-gray-600 disabled:opacity-40">
            해지(테스트)
          </button>
        </>
      ) : (
        <Link
          href="/pricing"
          className="rounded-full border border-fuchsia-300 px-2.5 py-1 text-fuchsia-600 transition hover:bg-fuchsia-50 dark:border-fuchsia-800 dark:text-fuchsia-400 dark:hover:bg-fuchsia-950/30"
        >
          구독하기
        </Link>
      )}
      <button onClick={signOut} className="text-gray-400 underline hover:text-gray-600">
        로그아웃
      </button>
    </div>
  );
}
