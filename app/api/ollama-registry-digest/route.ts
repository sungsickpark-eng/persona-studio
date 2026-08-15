import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

// "설치된 모델에 업데이트가 있는지" 배지용 — Ollama의 공개 레지스트리(registry.ollama.ai, Docker Distribution v2
// 호환)에서 태그의 매니페스트를 그대로 받아 raw 바이트를 sha256 해시하면, 그 값이 로컬 `ollama list`(=/api/tags)의
// `digest` 필드와 정확히 일치한다(둘 다 같은 매니페스트 JSON의 콘텐츠 해시). 즉 원격 매니페스트를 받아 해시만 비교하면
// 실제로 모델을 내려받지 않고도 "새 버전이 있는지" 미리 알 수 있다.
// registry.ollama.ai는 사용자의 로컬 Ollama가 아니라 공개 인터넷 호스트라, 다른 로컬 LLM 호출과 달리
// 브라우저가 아니라 이 서버에서 바로 호출해도 된다(CORS/localhost 문제 없음).
function parseModelRef(ref: string) {
  const [namePart, tag = "latest"] = ref.split(":");
  const parts = namePart.split("/").filter(Boolean);
  const name = parts.pop() ?? namePart;
  const namespace = parts.length ? parts.join("/") : "library";
  return { namespace, name, tag };
}

async function fetchDigest(ref: string): Promise<string | null> {
  try {
    const { namespace, name, tag } = parseModelRef(ref);
    const res = await fetch(`https://registry.ollama.ai/v2/${namespace}/${name}/manifests/${tag}`, {
      headers: { Accept: "application/vnd.docker.distribution.manifest.v2+json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return createHash("sha256").update(Buffer.from(buf)).digest("hex");
  } catch {
    return null; // 네트워크 오류·존재하지 않는(비공개/커스텀) 모델 등 — 배지를 그냥 안 띄우면 되므로 조용히 무시
  }
}

export async function POST(req: Request) {
  const { refs } = (await req.json()) as { refs?: string[] };
  if (!Array.isArray(refs) || refs.length === 0) return NextResponse.json({ digests: {} });

  const entries = await Promise.all(refs.map(async (ref) => [ref, await fetchDigest(ref)] as const));
  return NextResponse.json({ digests: Object.fromEntries(entries) });
}
