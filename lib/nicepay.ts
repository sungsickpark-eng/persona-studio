// 나이스페이 JS SDK 로더 + 결제창 호출. 서버 승인은 app/api/nicepay/auth/route.ts가 담당한다
// (여기서는 결제창을 띄우기만 하고, 실제 승인/구독 반영은 나이스페이가 반환한 tid로 서버가 처리).
declare global {
  interface Window {
    AUTHNICE: {
      requestPay: (params: NicePayParams) => void;
    };
  }
}

interface NicePayParams {
  clientId: string;
  method: string;
  orderId: string;
  amount: number;
  goodsName: string;
  returnUrl: string;
  mallReserved?: string;
  fnError?: (result: { resultCode: string; resultMsg: string }) => void;
}

export async function loadNicePay(): Promise<void> {
  if (typeof window === "undefined") return;
  if (window.AUTHNICE) return;

  if (document.querySelector('script[src*="nicepay.co.kr"]')) {
    await new Promise<void>((resolve, reject) => {
      const timer = setInterval(() => {
        if (window.AUTHNICE) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
      setTimeout(() => {
        clearInterval(timer);
        reject(new Error("NicePay SDK timeout"));
      }, 10000);
    });
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://pay.nicepay.co.kr/v1/js/";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("NicePay SDK 로딩 실패"));
    document.head.appendChild(script);
  });
}

export function requestNicePay(params: NicePayParams): void {
  window.AUTHNICE.requestPay(params);
}
