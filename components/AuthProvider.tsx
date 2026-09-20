"use client";
// 로그인 상태 + 구독(유료) 상태를 앱 전체에서 쓸 수 있게 하는 컨텍스트. 화면 출력이 없으므로 루트 레이아웃에
// 마케팅 랜딩 페이지까지 함께 감싸도 안전하다(app/layout.tsx 참고).
// Supabase 환경변수가 없는 환경(클라우드 저장 미설정)에서도 앱이 죽지 않도록, 클라이언트 생성은 여기서 한 번만
// try 해보고 실패하면 "로그인 기능 자체가 없는 상태"로 조용히 빠진다 — 무료 로컬 전용 사용에는 영향 없음.
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { loadCloudSyncPref, pullAndMergeCloudProjects, saveCloudSyncPref, setCloudSyncEligibility } from "@/lib/cloudSync";
import type { PlanId } from "@/lib/pricing";

type SubStatus = "loading" | "none" | "inactive" | "active";

type AuthCtx = {
  user: User | null;
  authLoading: boolean;
  isAdmin: boolean;
  subStatus: SubStatus;
  subPlan: PlanId | null;
  cloudSyncEnabled: boolean;
  setCloudSyncEnabled: (enabled: boolean) => void;
  signInWithGoogle: () => Promise<void>;
  signInWithKakao: () => Promise<void>;
  signOut: () => Promise<void>;
  activateMockSubscription: (action: "activate", plan: PlanId) => Promise<void>;
  deactivateMockSubscription: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [supabase] = useState<SupabaseClient | null>(() => {
    try {
      return createClient();
    } catch {
      return null; // 클라우드 저장 미설정 — 로그인 UI는 비활성 상태로 표시됨
    }
  });
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [subStatus, setSubStatus] = useState<SubStatus>("loading");
  const [subPlan, setSubPlan] = useState<PlanId | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [cloudSyncEnabled, setCloudSyncEnabledState] = useState<boolean>(() => loadCloudSyncPref());

  useEffect(() => {
    if (!supabase) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAuthLoading(false);
      setSubStatus("none");
      setSubPlan(null);
      return;
    }
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) {
        setUser(data.session?.user ?? null);
        setAuthLoading(false);
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSubStatus("none");
      setSubPlan(null);
      return;
    }
    let cancelled = false;
    supabase
      .from("subscriptions")
      .select("status, plan")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const active = data?.status === "active";
        setSubStatus(active ? "active" : "inactive");
        setSubPlan(active ? ((data?.plan as PlanId | null) ?? null) : null);
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, user]);

  // 헤더에 "관리자" 메뉴를 띄울지 판단하기 위한 조회 — ADMIN_EMAILS는 서버 전용이라 클라이언트에서 직접 못 봄.
  useEffect(() => {
    if (!supabase || !user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsAdmin(false);
      return;
    }
    let cancelled = false;
    fetch("/api/admin/me")
      .then((res) => res.json())
      .then((d: { isAdmin: boolean }) => {
        if (!cancelled) setIsAdmin(!!d.isAdmin);
      })
      .catch(() => {
        if (!cancelled) setIsAdmin(false);
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, user]);

  // 클라우드 동기화가 실제로 켜지는 조건을 한곳에서만 판단한다: 로그인 + 구독중 + 로컬 "동시 저장" 설정이 켜져 있을 때.
  // (로그인/구독 상태를 바꾸는 다른 곳에서 개별적으로 챙길 필요 없이, 셋 중 뭐가 바뀌든 여기서 자동으로 다시 계산됨)
  useEffect(() => {
    setCloudSyncEligibility(user && subStatus === "active" && cloudSyncEnabled ? user.id : null);
  }, [user, subStatus, cloudSyncEnabled]);

  const value = useMemo<AuthCtx>(
    () => ({
      user,
      authLoading,
      isAdmin,
      subStatus,
      subPlan,
      cloudSyncEnabled,
      setCloudSyncEnabled: (enabled: boolean) => {
        saveCloudSyncPref(enabled);
        setCloudSyncEnabledState(enabled);
      },
      signInWithGoogle: async () => {
        await supabase?.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${location.origin}/auth/callback` } });
      },
      signInWithKakao: async () => {
        await supabase?.auth.signInWithOAuth({ provider: "kakao", options: { redirectTo: `${location.origin}/auth/callback` } });
      },
      signOut: async () => {
        await supabase?.auth.signOut();
      },
      // 목업 결제 — 실제 PG 연동 전까지 구독 상태만 서버 라우트로 테스트 전환 (app/api/billing/mock/route.ts 참고)
      activateMockSubscription: async (action, plan) => {
        const res = await fetch("/api/billing/mock", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action, plan }),
        });
        if (!res.ok) throw new Error(await res.text());
        setSubStatus("active");
        setSubPlan(plan);
        // 구독을 켜는 즉시 지금 로컬에 있는 프로젝트 전체를 클라우드로 올린다 (동시 저장 스위치가 꺼져 있어도 최초 1회는 올림)
        if (user) pullAndMergeCloudProjects(user.id).catch(() => {});
      },
      deactivateMockSubscription: async () => {
        const res = await fetch("/api/billing/mock", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "deactivate" }),
        });
        if (!res.ok) throw new Error(await res.text());
        setSubStatus("inactive");
        setSubPlan(null);
      },
    }),
    [supabase, user, authLoading, isAdmin, subStatus, subPlan, cloudSyncEnabled],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function useAuthCtx(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth/useSubscription은 AuthProvider 안에서만 쓸 수 있습니다.");
  return ctx;
}

export function useAuth() {
  const { user, authLoading, isAdmin, signInWithGoogle, signInWithKakao, signOut } = useAuthCtx();
  return { user, loading: authLoading, isAdmin, signInWithGoogle, signInWithKakao, signOut };
}

export function useSubscription() {
  const { subStatus, subPlan, cloudSyncEnabled, setCloudSyncEnabled, activateMockSubscription, deactivateMockSubscription } = useAuthCtx();
  return {
    status: subStatus,
    plan: subPlan,
    isPaid: subStatus === "active",
    cloudSyncEnabled,
    setCloudSyncEnabled,
    activateMockSubscription,
    deactivateMockSubscription,
  };
}
