"use client";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

const Code = ({ children }: { children: ReactNode }) => (
  <code className="rounded bg-gray-100 px-1 py-0.5 text-[13px] dark:bg-gray-900">{children}</code>
);
const Block = ({ children }: { children: string }) => (
  <pre className="mt-1 overflow-x-auto rounded bg-gray-100 p-2 text-[13px] dark:bg-gray-900">
    <code>{children}</code>
  </pre>
);

// 로컬 LLM(Ollama) 연동 안내 — 설정 도구의 "로컬 LLM" 섹션에서 링크로 연결됨.
// window.location.origin으로 지금 이 사이트의 실제 주소를 넣은 복붙 가능한 명령을 보여준다
export default function OllamaSetupPage() {
  // 이 페이지는 정적으로 미리 렌더링되므로(빌드 시점엔 window가 없음) 서버가 그린 빈 값과 클라이언트가 그릴 실제 origin이
  // 달라 하이드레이션이 어긋나지 않도록, 마운트 이후에 setTimeout으로 한 박자 늦춰 채워 넣는다
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setOrigin(window.location.origin), 0);
    return () => clearTimeout(t);
  }, []);
  const site = origin || "https://내-배포-주소";

  return (
    <main className="mx-auto max-w-2xl p-8 text-sm leading-relaxed">
      <Link href="/" className="text-gray-400 hover:underline">
        ← 홈으로
      </Link>
      <h1 className="mt-2 text-2xl font-bold">로컬 LLM(Ollama) 연동 설정</h1>
      <p className="mt-2 text-gray-500">
        이 사이트에서 &quot;로컬 LLM&quot;을 선택하면 서버가 아니라 지금 이 화면을 보고 있는 <b>이 컴퓨터의 브라우저</b>가
        직접 이 컴퓨터의 Ollama로 접속합니다 — 그래서 사이트가 배포돼 있어도 방문자마다 각자 자기 컴퓨터의 모델을 씁니다.
      </p>

      <h2 className="mt-6 text-lg font-semibold">1. Ollama 설치</h2>
      <p className="mt-1 text-gray-600 dark:text-gray-300">
        이미 Ollama가 설치돼 있고 모델도 받아뒀다면 이 단계는 건너뛰고 아래로 내려가세요.
      </p>
      <ul className="mt-2 space-y-2 text-gray-600 dark:text-gray-300">
        <li>
          <b>macOS</b> —{" "}
          <a href="https://ollama.com/download" target="_blank" rel="noreferrer" className="text-fuchsia-600 hover:underline dark:text-fuchsia-400">
            ollama.com/download
          </a>
          에서 내려받아 설치하거나, Homebrew가 있다면:
          <Block>brew install ollama</Block>
        </li>
        <li>
          <b>Windows</b> —{" "}
          <a href="https://ollama.com/download" target="_blank" rel="noreferrer" className="text-fuchsia-600 hover:underline dark:text-fuchsia-400">
            ollama.com/download
          </a>
          에서 설치 파일을 내려받아 실행합니다.
        </li>
        <li>
          <b>Linux</b> — 터미널에서:
          <Block>curl -fsSL https://ollama.com/install.sh | sh</Block>
        </li>
      </ul>
      <p className="mt-2 text-gray-600 dark:text-gray-300">
        설치가 끝나면 쓸 모델을 하나 이상 받아야 합니다(처음 한 번만, 용량이 커서 시간이 좀 걸릴 수 있습니다):
      </p>
      <Block>ollama pull gemma3</Block>
      <p className="mt-1 text-gray-600 dark:text-gray-300">
        받은 모델은 사이트 헤더의 &quot;모델&quot; 버튼에서 골라 쓰면 됩니다. 다른 모델을 원하면 이름만 바꿔서 같은 명령으로
        받을 수 있습니다(예: <Code>llama3.1</Code>, <Code>qwen2.5</Code>).
      </p>

      <h2 className="mt-6 text-lg font-semibold">2. 왜 별도 설정이 필요한가요</h2>
      <p className="mt-1 text-gray-600 dark:text-gray-300">
        Ollama는 보안을 위해 미리 허용해두지 않은 웹사이트가 브라우저를 통해 접속하는 걸 기본적으로 차단합니다(CORS). 그래서
        이 사이트(<Code>{site}</Code>)를 Ollama에 허용해줘야 연결됩니다. 이 설정은 사이트가 아니라{" "}
        <b>Ollama를 실행하는 각자의 컴퓨터</b>에서 해야 합니다.
      </p>

      <h2 className="mt-6 text-lg font-semibold">3. 이 사이트 허용하기 (macOS, 메뉴바 앱 기준 — 추천)</h2>
      <ol className="mt-1 list-decimal space-y-3 pl-5 text-gray-600 dark:text-gray-300">
        <li>
          터미널(Terminal.app)을 열고 아래 명령으로 이 사이트를 허용 목록에 등록합니다.
          <Block>{`launchctl setenv OLLAMA_ORIGINS "${site}"`}</Block>
        </li>
        <li>
          메뉴바의 Ollama 아이콘을 클릭해 <b>Quit Ollama</b>로 완전히 종료합니다.
        </li>
        <li>Spotlight(⌘+Space) 등으로 Ollama를 다시 실행합니다. 이후로는 터미널을 계속 열어둘 필요 없이 평소처럼 동작합니다.</li>
      </ol>

      <h2 className="mt-6 text-lg font-semibold">터미널에서 직접 실행하는 방법</h2>
      <p className="mt-1 text-gray-600 dark:text-gray-300">
        메뉴바 앱 대신 터미널에서 직접 켜고 싶다면(이 경우 그 터미널 창을 닫으면 Ollama도 같이 꺼집니다):
      </p>
      <Block>{`OLLAMA_ORIGINS=${site} ollama serve`}</Block>

      <h2 className="mt-6 text-lg font-semibold">&quot;address already in use&quot; 에러가 뜬다면</h2>
      <p className="mt-1 text-gray-600 dark:text-gray-300">
        이미 다른 Ollama가 백그라운드에서 실행 중이라는 뜻입니다(대개 메뉴바 앱이 자동으로 켜져 있음). 메뉴바 아이콘에서
        먼저 <b>Quit Ollama</b>로 끈 뒤 다시 시도하세요. 메뉴바에 아이콘이 안 보이면 터미널에서 <Code>lsof -i :11434</Code>
        로 점유 중인 프로세스를 찾아 <Code>kill &lt;PID&gt;</Code>로 종료할 수 있습니다.
      </p>

      <h2 className="mt-6 text-lg font-semibold">여러 사이트에서 계속 쓰고 싶다면</h2>
      <p className="mt-1 text-gray-600 dark:text-gray-300">
        매번 주소를 새로 등록하기 번거로우면 전부 허용해둘 수 있습니다(보안은 느슨해지지만 개인 컴퓨터 용도로는 괜찮습니다):
      </p>
      <Block>{`launchctl setenv OLLAMA_ORIGINS "*"`}</Block>

      <h2 className="mt-6 text-lg font-semibold">Windows·Linux를 쓴다면</h2>
      <p className="mt-1 text-gray-600 dark:text-gray-300">
        방식은 같고 환경변수를 등록하는 방법만 다릅니다 — Windows는 시스템 속성의 환경 변수 설정(또는 <Code>setx</Code>)으로,
        Linux는 systemd로 Ollama를 서비스 등록해뒀다면 서비스 파일에 <Code>Environment=&quot;OLLAMA_ORIGINS={site}&quot;</Code>를
        추가한 뒤 서비스를 재시작하면 됩니다.
      </p>

      <h2 className="mt-6 text-lg font-semibold">터미널이 부담스럽다면</h2>
      <p className="mt-1 text-gray-600 dark:text-gray-300">
        프로젝트 화면 헤더의 &quot;설정&quot;에서 로컬 LLM 대신 OpenAI·Google Gemini·Claude 같은 클라우드 AI를 선택하고 API
        키만 입력하면, 이런 CORS 설정 없이 바로 사용할 수 있습니다.
      </p>
    </main>
  );
}
