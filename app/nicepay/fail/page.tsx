"use client";
// 나이스페이 결제 실패/취소 후 도착하는 페이지. app/api/nicepay/auth/route.ts가 실패 사유를 code/msg로 실어 보낸다.
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function FailContent() {
  const params = useSearchParams();
  const router = useRouter();
  const code = params.get("code") || "";
  const msg = params.get("msg") || "결제에 실패했습니다.";

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-6 dark:bg-gray-950">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-8 text-center shadow-xl dark:border-gray-800 dark:bg-gray-900">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-rose-50 text-3xl dark:bg-rose-950/30">✕</div>
        <h1 className="ws-serif text-xl font-bold">결제에 실패했습니다</h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{msg}</p>
        {code && <p className="mt-1 text-xs text-gray-400">오류 코드: {code}</p>}
        <div className="mt-6 flex flex-col gap-2">
          <button
            onClick={() => router.push("/pricing")}
            className="w-full rounded-md bg-fuchsia-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-fuchsia-500"
          >
            다시 시도하기
          </button>
          <button
            onClick={() => router.push("/app")}
            className="w-full rounded-md border border-gray-200 px-4 py-2.5 text-sm transition hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900"
          >
            프로젝트 목록으로
          </button>
        </div>
      </div>
    </div>
  );
}

export default function NicePayFailPage() {
  return (
    <Suspense>
      <FailContent />
    </Suspense>
  );
}
