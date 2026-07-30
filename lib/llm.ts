// 채팅형 LLM 호출을 provider(로컬 Ollama / OpenAI / Google Gemini / Claude)별로 분기.
// 클라이언트가 요청마다 LLMSettings(설정 도구에서 localStorage에 저장한 값)를 함께 보내고,
// 이 서버 라우트가 실제 provider API로 중계한다 — 키가 브라우저 밖으로 안 나가고, 브라우저→provider 직접 호출 시 겪는 CORS 문제도 없음
import { DEFAULT_LLM_SETTINGS, type LLMSettings } from "@/lib/store";

const ENV_OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const ENV_OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "gemma4:latest";
// Vercel(과 그 외 원격 서버)에서 이 API 라우트를 실행 중이면, "로컬 LLM 서버 주소"의 localhost는 사용자의 컴퓨터가 아니라
// 그 원격 서버 자신을 가리키게 되어 절대 연결될 수 없다 — 흔한 오해라 원인을 바로 설명해주는 전용 에러를 던진다
const IS_REMOTE_HOST = !!process.env.VERCEL;
const isLoopbackUrl = (url: string) => {
  try {
    return ["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(new URL(url).hostname);
  } catch {
    return false;
  }
};
const REMOTE_OLLAMA_HINT =
  "Vercel처럼 원격 서버에 배포된 상태에서는 이 컴퓨터의 localhost에 떠 있는 Ollama에 접속할 수 없습니다(배포된 서버와 이 컴퓨터는 서로 다른 기기입니다). 설정에서 OpenAI/Gemini/Claude 같은 클라우드 AI를 선택하거나, ngrok·Cloudflare Tunnel 등으로 Ollama를 외부에 공개한 뒤 그 공개 주소를 로컬 LLM 서버 주소에 입력하세요.";

type ChatMsg = { role: "user" | "assistant"; content: string };

export async function callLLM(
  llm: LLMSettings | undefined,
  ollamaModel: string,
  system: string,
  messages: ChatMsg[],
  schema: object,
  temperature: number,
): Promise<unknown> {
  const settings = llm ?? DEFAULT_LLM_SETTINGS;
  switch (settings.provider) {
    case "openai":
      return callOpenAI(settings, system, messages, temperature);
    case "gemini":
      return callGemini(settings, system, messages, temperature);
    case "claude":
      return callClaude(settings, system, messages, schema, temperature);
    default:
      return callOllama(settings, ollamaModel, system, messages, schema, temperature);
  }
}

export function llmConnectErrorMessage(llm: LLMSettings | undefined): string {
  const settings = llm ?? DEFAULT_LLM_SETTINGS;
  switch (settings.provider) {
    case "openai":
      return `OpenAI API에 연결할 수 없습니다 (${settings.openaiUrl || DEFAULT_LLM_SETTINGS.openaiUrl}). 인터넷 연결과 설정의 API 주소·키를 확인하세요.`;
    case "gemini":
      return `Gemini API에 연결할 수 없습니다 (${settings.geminiUrl || DEFAULT_LLM_SETTINGS.geminiUrl}). 인터넷 연결과 설정의 API 주소·키를 확인하세요.`;
    case "claude":
      return `Claude API에 연결할 수 없습니다 (${settings.claudeUrl || DEFAULT_LLM_SETTINGS.claudeUrl}). 인터넷 연결과 설정의 API 주소·키를 확인하세요.`;
    default: {
      const url = settings.ollamaUrl || ENV_OLLAMA_URL;
      if (IS_REMOTE_HOST && isLoopbackUrl(url)) return REMOTE_OLLAMA_HINT;
      return `Ollama에 연결할 수 없습니다 (${url}). 'ollama serve'가 실행 중인지 확인하세요.`;
    }
  }
}

async function callOllama(
  settings: LLMSettings,
  ollamaModel: string,
  system: string,
  messages: ChatMsg[],
  schema: object,
  temperature: number,
) {
  const url = settings.ollamaUrl || ENV_OLLAMA_URL;
  const model = ollamaModel || ENV_OLLAMA_MODEL;
  // 연결을 시도했다가 타임아웃으로 실패하길 기다리지 않고, 애초에 연결될 수 없는 조합이면 바로 이유를 알려준다
  if (IS_REMOTE_HOST && isLoopbackUrl(url)) throw new Error(REMOTE_OLLAMA_HINT);
  const res = await fetch(`${url}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: system }, ...messages],
      stream: false,
      format: schema, // Ollama structured output: JSON 스키마 강제
      options: { temperature },
    }),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return JSON.parse(data.message?.content ?? "{}");
}

async function callOpenAI(settings: LLMSettings, system: string, messages: ChatMsg[], temperature: number) {
  if (!settings.openaiKey) throw new Error("OpenAI API 키가 설정되지 않았습니다. 설정 도구에서 입력하세요.");
  const url = settings.openaiUrl || DEFAULT_LLM_SETTINGS.openaiUrl;
  const model = settings.openaiModel || DEFAULT_LLM_SETTINGS.openaiModel;
  const res = await fetch(`${url}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.openaiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        ...(messages.length ? messages : [{ role: "user", content: "위 지침에 따라 응답하라." }]),
      ],
      response_format: { type: "json_object" },
      temperature,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
}

async function callGemini(settings: LLMSettings, system: string, messages: ChatMsg[], temperature: number) {
  if (!settings.geminiKey) throw new Error("Gemini API 키가 설정되지 않았습니다. 설정 도구에서 입력하세요.");
  const url = settings.geminiUrl || DEFAULT_LLM_SETTINGS.geminiUrl;
  const model = settings.geminiModel || DEFAULT_LLM_SETTINGS.geminiModel;
  const contents = (messages.length ? messages : [{ role: "user" as const, content: "위 지침에 따라 응답하라." }]).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  const res = await fetch(`${url}/v1beta/models/${model}:generateContent?key=${settings.geminiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents,
      generationConfig: { temperature, responseMimeType: "application/json" },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = (data.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
  return JSON.parse(text || "{}");
}

async function callClaude(settings: LLMSettings, system: string, messages: ChatMsg[], schema: object, temperature: number) {
  if (!settings.claudeKey) throw new Error("Claude API 키가 설정되지 않았습니다. 설정 도구에서 입력하세요.");
  const url = settings.claudeUrl || DEFAULT_LLM_SETTINGS.claudeUrl;
  const model = settings.claudeModel || DEFAULT_LLM_SETTINGS.claudeModel;
  // Claude는 Ollama/OpenAI/Gemini와 달리 "JSON으로만 답하라"는 강제 옵션이 없어서, 스키마를 도구(tool) 하나로 등록하고
  // tool_choice로 그 도구 호출을 강제하는 방식으로 구조화된 출력을 받는다(공식 권장 패턴) — input이 이미 파싱된 객체로 옴
  const res = await fetch(`${url}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": settings.claudeKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      system,
      max_tokens: 4096,
      temperature,
      messages: messages.length ? messages : [{ role: "user", content: "위 지침에 따라 응답하라." }],
      tools: [{ name: "respond", input_schema: schema }],
      tool_choice: { type: "tool", name: "respond" },
    }),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const toolUse = (data.content ?? []).find((b: { type: string }) => b.type === "tool_use");
  if (!toolUse) throw new Error("Claude 응답에서 구조화된 결과를 받지 못했습니다.");
  return toolUse.input;
}
