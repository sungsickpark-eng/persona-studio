// 채팅형 LLM 호출을 provider(로컬 Ollama / OpenAI / Google Gemini / Claude)별로 분기.
// 클라이언트가 요청마다 LLMSettings(설정 도구에서 localStorage에 저장한 값)를 함께 보내고,
// OpenAI/Gemini/Claude는 이 서버 라우트가 실제 provider API로 중계한다(키가 브라우저 밖으로 안 나가고, CORS 문제도 없음).
//
// 로컬 Ollama는 반대로 서버가 절대 대신 호출하면 안 된다 — Vercel처럼 원격 서버에 배포되면 "localhost"는 그 서버 자신을
// 가리키게 되어 각 사용자의 컴퓨터에 있는 Ollama와는 애초에 무관하기 때문. 그래서 서버는 요청만 조립해서 돌려주고
// (buildOllamaRequest), 실제 fetch는 항상 사용자의 브라우저가 직접 자기 자신의 Ollama로 보낸다(app/p/[id]/page.tsx의 postAI).
// 이러려면 Ollama 쪽에서 이 사이트 origin을 허용해야 함: `OLLAMA_ORIGINS` 환경변수(예: `OLLAMA_ORIGINS=https://내배포주소.vercel.app`)로 `ollama serve` 실행.
import { DEFAULT_LLM_SETTINGS, type LLMSettings } from "@/lib/store";

const ENV_OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const ENV_OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "gemma4:latest";

type ChatMsg = { role: "user" | "assistant"; content: string };

export function isOllamaProvider(llm: LLMSettings | undefined): boolean {
  return (llm ?? DEFAULT_LLM_SETTINGS).provider === "ollama";
}

// 실제 fetch는 하지 않고, 사용자의 브라우저가 자기 Ollama로 그대로 보낼 수 있는 요청(url+body)만 조립해서 돌려준다
export function buildOllamaRequest(
  llm: LLMSettings | undefined,
  ollamaModel: string,
  system: string,
  messages: ChatMsg[],
  schema: object,
  temperature: number,
): { url: string; body: object } {
  const settings = llm ?? DEFAULT_LLM_SETTINGS;
  const url = settings.ollamaUrl || ENV_OLLAMA_URL;
  const model = ollamaModel || ENV_OLLAMA_MODEL;
  return {
    url: `${url}/api/chat`,
    body: {
      model,
      messages: [{ role: "system", content: system }, ...messages],
      stream: false,
      format: schema, // Ollama structured output: JSON 스키마 강제
      options: { temperature },
    },
  };
}

// OpenAI/Gemini/Claude 전용 — provider가 "ollama"면 buildOllamaRequest를 대신 써야 하므로(호출하는 쪽에서 isOllamaProvider로
// 먼저 분기) 여기서는 다루지 않는다
export async function callLLM(
  llm: LLMSettings | undefined,
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
      throw new Error("callLLM은 ollama를 지원하지 않습니다 — isOllamaProvider로 먼저 분기해 buildOllamaRequest를 쓰세요.");
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
    default:
      // 서버는 ollama를 직접 호출하지 않으므로(항상 브라우저가 직접 호출) 이 분기는 정상 흐름에서 나오지 않는다
      return "로컬 LLM 연결은 이 브라우저가 직접 처리합니다.";
  }
}

async function callOpenAI(settings: LLMSettings, system: string, messages: ChatMsg[], temperature: number) {
  const key = settings.openaiKey.trim();
  if (!key) throw new Error("OpenAI API 키가 설정되지 않았습니다. 설정 도구에서 입력하세요.");
  const url = (settings.openaiUrl || DEFAULT_LLM_SETTINGS.openaiUrl).trim().replace(/\/+$/, "");
  const model = settings.openaiModel.trim() || DEFAULT_LLM_SETTINGS.openaiModel;
  const res = await fetch(`${url}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
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
  const key = settings.geminiKey.trim();
  if (!key) throw new Error("Gemini API 키가 설정되지 않았습니다. 설정 도구에서 입력하세요.");
  const url = (settings.geminiUrl || DEFAULT_LLM_SETTINGS.geminiUrl).trim().replace(/\/+$/, "");
  const model = settings.geminiModel.trim() || DEFAULT_LLM_SETTINGS.geminiModel;
  const contents = (messages.length ? messages : [{ role: "user" as const, content: "위 지침에 따라 응답하라." }]).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  // 키를 URL 쿼리 문자열(?key=...)로 보내는 옛 방식 대신, 구글이 현재 권장하는 x-goog-api-key 헤더로 보낸다
  // (URL에 키가 안 남고, 프록시·로그에 실수로 남는 경우도 줄어듦 — 인증 오류(401) 자체의 근본 원인은 대개 키 값이
  // 잘못됐거나(OAuth 클라이언트 ID 등 다른 종류의 자격증명을 붙여넣은 경우 포함) Vertex AI 전용 주소를 썼을 때이므로,
  // 진짜 Generative Language API 키인지(https://aistudio.google.com/apikey)를 먼저 확인해야 함)
  const res = await fetch(`${url}/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
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
  const key = settings.claudeKey.trim();
  if (!key) throw new Error("Claude API 키가 설정되지 않았습니다. 설정 도구에서 입력하세요.");
  const url = (settings.claudeUrl || DEFAULT_LLM_SETTINGS.claudeUrl).trim().replace(/\/+$/, "");
  const model = settings.claudeModel.trim() || DEFAULT_LLM_SETTINGS.claudeModel;
  // Claude는 Ollama/OpenAI/Gemini와 달리 "JSON으로만 답하라"는 강제 옵션이 없어서, 스키마를 도구(tool) 하나로 등록하고
  // tool_choice로 그 도구 호출을 강제하는 방식으로 구조화된 출력을 받는다(공식 권장 패턴) — input이 이미 파싱된 객체로 옴
  const res = await fetch(`${url}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
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
