import { NextResponse } from "next/server";

// 설정 화면의 Gemini 모델 드롭다운용 — Google이 모델명을 자주 바꾸다 보니(2.0→2.5→3.5 순으로 구버전이
// 계속 내려감) 하드코딩한 목록은 금방 또 틀어진다. 대신 사용자의 키로 실제 ListModels를 호출해
// "지금 이 키로 실제로 쓸 수 있는" 목록을 그대로 보여준다.
export async function POST(req: Request) {
  const { key, url } = (await req.json()) as { key?: string; url?: string };
  if (!key?.trim()) return NextResponse.json({ error: "API 키를 먼저 입력하세요." }, { status: 400 });

  const base = (url?.trim() || "https://generativelanguage.googleapis.com").replace(/\/+$/, "");
  // SSRF 방지: 이 서버가 사용자가 준 URL로 그대로 요청을 보내므로, Google API 호스트가 아니면 거절한다
  // (안 그러면 이 라우트가 내부망·클라우드 메타데이터 엔드포인트를 대신 찔러보는 오픈 프록시가 될 수 있음)
  let host: string;
  try {
    const parsed = new URL(base);
    if (parsed.protocol !== "https:") throw new Error("not https");
    host = parsed.hostname;
  } catch {
    return NextResponse.json({ error: "API 주소가 올바르지 않습니다." }, { status: 400 });
  }
  if (host !== "googleapis.com" && !host.endsWith(".googleapis.com")) {
    return NextResponse.json({ error: "googleapis.com 도메인의 주소만 사용할 수 있습니다." }, { status: 400 });
  }

  const res = await fetch(`${base}/v1beta/models?pageSize=1000`, {
    headers: { "x-goog-api-key": key.trim() },
  });
  if (!res.ok) return NextResponse.json({ error: `Gemini ${res.status}: ${await res.text()}` }, { status: 502 });

  const data = await res.json();
  const models = ((data.models ?? []) as { name?: string; supportedGenerationMethods?: string[] }[])
    .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
    .map((m) => m.name?.replace(/^models\//, "") ?? "")
    .filter(Boolean)
    .sort();

  return NextResponse.json({ models });
}
