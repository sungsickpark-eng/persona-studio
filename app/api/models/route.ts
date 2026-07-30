import { NextResponse } from "next/server";

// 로컬 Ollama가 설치된 모델 목록을 조회하고(GET), 아직 없는 모델을 내려받는다(POST) — /api/chat, /api/story와 같은 서버
const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";

function connectionError(e: unknown) {
  return e instanceof TypeError
    ? `Ollama에 연결할 수 없습니다 (${OLLAMA_URL}). 'ollama serve'가 실행 중인지 확인하세요.`
    : String(e);
}

export async function GET() {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`);
    if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return NextResponse.json({ models: data.models ?? [] });
  } catch (e) {
    return NextResponse.json({ error: connectionError(e) }, { status: 500 });
  }
}

// 아직 안 받은 모델을 내려받는다. Ollama의 /api/pull은 다운로드 진행률을 NDJSON으로 스트리밍하므로
// 그대로 클라이언트에 흘려보내 진행률 표시줄을 그릴 수 있게 한다
export async function POST(req: Request) {
  const { name } = (await req.json()) as { name?: string };
  if (!name?.trim()) return NextResponse.json({ error: "모델 이름이 필요합니다." }, { status: 400 });

  try {
    const res = await fetch(`${OLLAMA_URL}/api/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: name.trim(), stream: true }),
    });
    if (!res.ok || !res.body) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
    return new Response(res.body, { headers: { "Content-Type": "application/x-ndjson" } });
  } catch (e) {
    return NextResponse.json({ error: connectionError(e) }, { status: 500 });
  }
}
