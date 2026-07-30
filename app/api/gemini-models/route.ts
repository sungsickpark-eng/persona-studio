import { NextResponse } from "next/server";

// 설정 화면의 Gemini 모델 드롭다운용 — Google이 모델명을 자주 바꾸다 보니(2.0→2.5→3.5 순으로 구버전이
// 계속 내려감) 하드코딩한 목록은 금방 또 틀어진다. 대신 사용자의 키로 실제 ListModels를 호출해
// "지금 이 키로 실제로 쓸 수 있는" 목록을 그대로 보여준다.
export async function POST(req: Request) {
  const { key, url } = (await req.json()) as { key?: string; url?: string };
  if (!key?.trim()) return NextResponse.json({ error: "API 키를 먼저 입력하세요." }, { status: 400 });

  const base = (url?.trim() || "https://generativelanguage.googleapis.com").replace(/\/+$/, "");
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
