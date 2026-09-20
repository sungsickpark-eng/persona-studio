"use client";
// 나이스페이 결제 성공 후 도착하는 페이지. app/api/nicepay/auth/route.ts가 구독 반영을 마친 뒤 이 주소로
// 보낸다(returnPath로 원래 돌아갈 위치를 넘김).
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function SuccessContent() {
  const params = useSearchParams();
  const router = useRouter();
  const returnPath = params.get("returnPath") || "/app";

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-6 dark:bg-gray-950">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-8 text-center shadow-xl dark:border-gray-800 dark:bg-gray-900">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-3xl dark:bg-emerald-950/30">✓</div>
        <h1 className="ws-serif text-xl font-bold">결제가 완료되었습니다</h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">구독해 주셔서 감사합니다.</p>
        <button
          onClick={() => router.push(returnPath)}
          className="mt-6 w-full rounded-md bg-fuchsia-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-fuchsia-500"
        >
          계속하기
        </button>
      </div>
    </div>
  );
}

export default function NicePaySuccessPage() {
  return (
    <Suspense>
      <SuccessContent />
    </Suspense>
  );
}
