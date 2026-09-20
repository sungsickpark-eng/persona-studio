"use client";
// Google/Kakao 중 고르는 로그인 팝업. AuthBadge(헤더)와 대시보드의 "클라우드에 업로드" 버튼 양쪽에서 재사용한다.
import { useAuth } from "@/components/AuthProvider";

export default function LoginPicker({ onClose }: { onClose: () => void }) {
  const { signInWithGoogle, signInWithKakao } = useAuth();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6" onClick={onClose}>
      <div
        className="w-full max-w-xs rounded-xl border border-gray-200 bg-white p-5 shadow-2xl dark:border-gray-800 dark:bg-gray-950"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="ws-serif text-lg font-bold">로그인</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            닫기 ✕
          </button>
        </div>
        <div className="flex flex-col gap-2 text-sm">
          <button
            onClick={signInWithGoogle}
            className="rounded-md border border-gray-200 px-3 py-2.5 text-left transition hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900"
          >
            Google로 계속하기
          </button>
          <button
            onClick={signInWithKakao}
            className="rounded-md border border-gray-200 px-3 py-2.5 text-left transition hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900"
          >
            Kakao로 계속하기
          </button>
        </div>
      </div>
    </div>
  );
}
