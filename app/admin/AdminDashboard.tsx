"use client";
// 관리자 대시보드 UI. 접근 자체는 app/admin/page.tsx(서버 컴포넌트)가 requireAdmin()으로 막고,
// 여기서는 통과한 사람에게만 렌더링되는 실제 화면을 그린다. /api/admin/* 라우트도 각자 requireAdmin()으로
// 한 번 더 확인하므로(lib/adminAuth.ts) 이중 방어.
import { useEffect, useState } from "react";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import { PLANS, type PlanId } from "@/lib/pricing";

type AdminUser = {
  id: string;
  email: string;
  createdAt: string;
  lastSignInAt: string | null;
  status: string;
  plan: PlanId | null;
  currentPeriodEnd: string | null;
  usageCount: number;
  usageCap: number;
  projectCount: number;
  isAdmin: boolean;
};

type AdminUserDetail = {
  id: string;
  email: string;
  createdAt: string;
  lastSignInAt: string | null;
  subscription: { status: string; plan: PlanId | null; current_period_end: string | null; provider: string | null } | null;
  usageCount: number;
  projects: { id: string; name: string; updated_at: string }[];
};

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" }) : "—");

export default function AdminDashboard() {
  const [state, setState] = useState<"loading" | "forbidden" | "ready">("loading");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = () => {
    setState("loading");
    fetch("/api/admin/users")
      .then(async (res) => {
        if (res.status === 403) {
          setState("forbidden");
          return;
        }
        const data = await res.json();
        setUsers(data.users ?? []);
        setState("ready");
      })
      .catch(() => setState("forbidden"));
  };
  // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 1회 목록을 불러옴 (load는 저장 후 재조회에도 재사용)
  useEffect(load, []);

  const matches = (u: AdminUser) => u.email.toLowerCase().includes(query.trim().toLowerCase());
  const adminUsers = users.filter((u) => u.isAdmin && matches(u));
  const regularUsers = users.filter((u) => !u.isAdmin && matches(u));

  const columns = (
    <tr>
      <th className="px-3 py-2">이메일</th>
      <th className="px-3 py-2">가입일</th>
      <th className="px-3 py-2">구독</th>
      <th className="px-3 py-2">AI 사용량</th>
      <th className="px-3 py-2">프로젝트</th>
    </tr>
  );

  const row = (u: AdminUser) => (
    <tr
      key={u.id}
      onClick={() => setSelectedId(u.id)}
      className="cursor-pointer border-t border-gray-100 hover:bg-gray-50 dark:border-gray-900 dark:hover:bg-gray-900"
    >
      <td className="px-3 py-2">{u.email}</td>
      <td className="px-3 py-2 text-gray-500">{fmt(u.createdAt)}</td>
      <td className="px-3 py-2">
        {u.status === "active" ? (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
            {u.plan ? PLANS[u.plan].label : "구독중"}
          </span>
        ) : (
          <span className="text-xs text-gray-400">{u.status === "canceled" ? "해지됨" : "미구독"}</span>
        )}
      </td>
      <td className="px-3 py-2 text-gray-500">
        {u.usageCount} / {u.usageCap}
      </td>
      <td className="px-3 py-2 text-gray-500">{u.projectCount}</td>
    </tr>
  );

  return (
    <main className="mx-auto max-w-5xl px-6 py-12 sm:px-8 sm:py-16">
      <header className="mb-8 flex items-start justify-between gap-3">
        <div>
          <Link href="/app" className="text-xs text-gray-400 transition hover:text-fuchsia-600 dark:hover:text-fuchsia-400">
            ← 프로젝트 목록
          </Link>
          <h1 className="ws-serif mt-1 text-3xl font-bold">관리자</h1>
        </div>
        <ThemeToggle className="shrink-0 rounded-full border border-gray-200 px-2.5 py-1.5 text-sm transition hover:border-fuchsia-400 dark:border-gray-800" />
      </header>

      {state === "loading" && <p className="text-sm text-gray-400">불러오는 중…</p>}
      {state === "forbidden" && <p className="text-sm text-red-500">권한이 없습니다. 관리자 계정으로 로그인했는지 확인하세요.</p>}

      {state === "ready" && (
        <>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="이메일로 검색"
            className="mb-4 w-full max-w-xs rounded-md border border-gray-200 bg-transparent px-3 py-2 text-sm outline-none focus:border-fuchsia-400 dark:border-gray-800"
          />

          {adminUsers.length > 0 && (
            <div className="mb-6">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fuchsia-600 dark:text-fuchsia-400">
                관리자 ({adminUsers.length})
              </h2>
              <div className="overflow-x-auto rounded-lg border border-fuchsia-200 dark:border-fuchsia-900">
                <table className="w-full text-left text-sm">
                  <thead className="bg-fuchsia-50 text-xs text-gray-500 dark:bg-fuchsia-950/30 dark:text-gray-400">{columns}</thead>
                  <tbody>{adminUsers.map(row)}</tbody>
                </table>
              </div>
            </div>
          )}

          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">전체 회원 ({regularUsers.length})</h2>
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 dark:bg-gray-900 dark:text-gray-400">{columns}</thead>
              <tbody>
                {regularUsers.map(row)}
                {regularUsers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-gray-400">
                      사용자가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {selectedId && <UserDetail id={selectedId} onClose={() => setSelectedId(null)} onChanged={load} />}
    </main>
  );
}

function UserDetail({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [status, setStatus] = useState<"inactive" | "active" | "canceled">("inactive");
  const [plan, setPlan] = useState<PlanId>("monthly");
  const [periodEnd, setPeriodEnd] = useState(""); // <input type=date>용 yyyy-mm-dd
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch(`/api/admin/users/${id}`)
      .then((res) => res.json())
      .then((d: AdminUserDetail) => {
        setDetail(d);
        setStatus((d.subscription?.status as typeof status) ?? "inactive");
        setPlan(d.subscription?.plan ?? "monthly");
        setPeriodEnd(d.subscription?.current_period_end ? d.subscription.current_period_end.slice(0, 10) : "");
      });
  }, [id]);

  const saveSubscription = async () => {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(`/api/admin/users/${id}/subscription`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status,
          plan: status === "active" ? plan : null,
          currentPeriodEnd: periodEnd ? new Date(periodEnd).toISOString() : null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "저장 실패");
      setMsg("저장했습니다.");
      onChanged();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const resetUsage = async () => {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(`/api/admin/users/${id}/reset-usage`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error ?? "초기화 실패");
      setDetail((d) => (d ? { ...d, usageCount: 0 } : d));
      setMsg("이번 달 AI 사용량을 초기화했습니다.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-950"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-5 py-3 dark:border-gray-800">
          <h2 className="ws-serif truncate text-lg font-bold">{detail?.email ?? "불러오는 중…"}</h2>
          <button onClick={onClose} className="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            닫기 ✕
          </button>
        </div>

        {!detail ? (
          <p className="p-5 text-sm text-gray-400">불러오는 중…</p>
        ) : (
          <div className="space-y-5 overflow-y-auto p-5 text-sm">
            <div className="text-xs text-gray-500">
              가입일 {fmt(detail.createdAt)} · 마지막 로그인 {fmt(detail.lastSignInAt)}
            </div>

            <div>
              <h3 className="mb-2 font-semibold">구독</h3>
              <div className="flex flex-wrap gap-2">
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as typeof status)}
                  className="rounded border border-gray-200 bg-transparent px-2 py-1.5 text-sm dark:border-gray-800"
                >
                  <option value="inactive">미구독</option>
                  <option value="active">구독중</option>
                  <option value="canceled">해지됨</option>
                </select>
                {status === "active" && (
                  <select
                    value={plan}
                    onChange={(e) => setPlan(e.target.value as PlanId)}
                    className="rounded border border-gray-200 bg-transparent px-2 py-1.5 text-sm dark:border-gray-800"
                  >
                    <option value="monthly">월간</option>
                    <option value="yearly">연간</option>
                  </select>
                )}
                <input
                  type="date"
                  value={periodEnd}
                  onChange={(e) => setPeriodEnd(e.target.value)}
                  title="만료일"
                  className="rounded border border-gray-200 bg-transparent px-2 py-1.5 text-sm dark:border-gray-800"
                />
                <button
                  onClick={saveSubscription}
                  disabled={busy}
                  className="rounded bg-fuchsia-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-fuchsia-500 disabled:opacity-40"
                >
                  저장
                </button>
              </div>
            </div>

            <div>
              <h3 className="mb-2 font-semibold">이번 달 포함 AI 사용량</h3>
              <div className="flex items-center gap-3">
                <span>{detail.usageCount}회</span>
                <button onClick={resetUsage} disabled={busy} className="text-xs text-fuchsia-600 underline hover:text-fuchsia-700 disabled:opacity-40 dark:text-fuchsia-400">
                  초기화
                </button>
              </div>
            </div>

            <div>
              <h3 className="mb-2 font-semibold">프로젝트 ({detail.projects.length})</h3>
              {detail.projects.length === 0 ? (
                <p className="text-xs text-gray-400">클라우드에 저장된 프로젝트가 없습니다.</p>
              ) : (
                <ul className="space-y-1 text-xs text-gray-600 dark:text-gray-300">
                  {detail.projects.map((p) => (
                    <li key={p.id} className="flex justify-between gap-2">
                      <span className="truncate">{p.name}</span>
                      <span className="shrink-0 text-gray-400">{fmt(p.updated_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {msg && <p className="text-xs text-gray-500">{msg}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
