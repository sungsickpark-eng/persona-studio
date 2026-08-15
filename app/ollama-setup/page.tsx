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

// 9개 절을 4부로 묶어 목차·구분선 양쪽에서 씀 — /guide 페이지와 같은 패턴
const TOC: { part: string; items: { id: string; label: string }[] }[] = [
  {
    part: "준비하기",
    items: [
      { id: "install", label: "1. Ollama 설치" },
      { id: "why", label: "2. 왜 별도 설정이 필요한가요" },
    ],
  },
  {
    part: "macOS에서 허용하기",
    items: [
      { id: "macos-allow", label: "3. 이 사이트 허용하기" },
      { id: "macos-terminal", label: "4. 터미널에서 직접 실행하기" },
      { id: "macos-error", label: `5. "주소 사용 중" 에러` },
      { id: "macos-multi", label: "6. 여러 사이트 허용하기" },
    ],
  },
  {
    part: "Windows · Linux에서 허용하기",
    items: [
      { id: "windows", label: "7. Windows에서 설정하기" },
      { id: "linux", label: "8. Linux에서 설정하기" },
    ],
  },
  {
    part: "그 외 방법",
    items: [{ id: "cloud", label: "9. 클라우드 AI로 전환하기" }],
  },
];

const OLLAMA_CSS = `
  .ollama-serif { font-family: "Nanum Myeongjo", "Apple Myungjo", Georgia, "Noto Serif KR", serif; letter-spacing: -0.01em; }
  .ollama-eyebrow {
    display: inline-flex; align-items: center; gap: 8px;
    font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.16em;
    color: #d946ef; margin-bottom: 6px;
  }
  .ollama-eyebrow::before { content: ""; width: 16px; height: 1px; background: currentColor; opacity: 0.6; }
`;

function PartHeader({ index, title }: { index: string; title: string }) {
  return (
    <div className="mt-14 first:mt-10">
      <p className="ollama-eyebrow">PART {index}</p>
      <h2 className="ollama-serif text-2xl font-bold">{title}</h2>
      <div className="mt-4 border-t border-gray-200 dark:border-gray-800" />
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="mt-8 scroll-mt-6">
      <h3 className="text-lg font-semibold">{title}</h3>
      <div className="mt-2 space-y-2 text-gray-600 dark:text-gray-300">{children}</div>
    </section>
  );
}

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
    <main className="mx-auto max-w-3xl p-8 text-sm leading-relaxed">
      <style>{OLLAMA_CSS}</style>
      <Link href="/app" className="text-gray-400 hover:underline">
        ← 홈으로
      </Link>
      <h1 className="ollama-serif mt-2 text-3xl font-bold">로컬 LLM(Ollama) 연동 설정</h1>
      <p className="mt-2 text-gray-500">
        이 사이트에서 &quot;로컬 LLM&quot;을 선택하면 서버가 아니라 지금 이 화면을 보고 있는 <b>이 컴퓨터의 브라우저</b>가
        직접 이 컴퓨터의 Ollama로 접속합니다 — 그래서 사이트가 배포돼 있어도 방문자마다 각자 자기 컴퓨터의 모델을 씁니다.
      </p>

      <nav className="mt-5 rounded-xl border border-gray-200 p-5 dark:border-gray-800">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">목차</p>
        <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
          {TOC.map((group) => (
            <div key={group.part}>
              <p className="mb-1.5 text-xs font-semibold text-fuchsia-600 dark:text-fuchsia-400">{group.part}</p>
              <ul className="space-y-1">
                {group.items.map((t) => (
                  <li key={t.id}>
                    <a
                      href={`#${t.id}`}
                      className="text-gray-600 hover:text-fuchsia-600 hover:underline dark:text-gray-300 dark:hover:text-fuchsia-400"
                    >
                      {t.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </nav>

      <PartHeader index="1" title="준비하기" />

      <Section id="install" title="1. Ollama 설치">
        <p>이미 Ollama가 설치돼 있고 모델도 받아뒀다면 이 단계는 건너뛰고 아래로 내려가세요.</p>
        <ul className="space-y-2">
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
        <p>
          설치가 끝나면 쓸 모델을 하나 이상 받아야 합니다(처음 한 번만, 용량이 커서 시간이 좀 걸릴 수 있습니다). 이 사이트의
          기본 모델은 <Code>gemma4</Code>입니다:
        </p>
        <Block>ollama pull gemma4</Block>
        <p>
          받은 모델은 사이트 헤더의 &quot;모델&quot; 버튼에서 골라 쓰면 됩니다. 다른 모델을 원하면 이름만 바꿔서 같은 명령으로
          받을 수 있습니다(예: <Code>llama3.1</Code>, <Code>qwen2.5</Code>).
        </p>
      </Section>

      <Section id="why" title="2. 왜 별도 설정이 필요한가요">
        <p>
          Ollama는 보안을 위해 미리 허용해두지 않은 웹사이트가 브라우저를 통해 접속하는 걸 기본적으로 차단합니다(CORS). 그래서
          이 사이트(<Code>{site}</Code>)를 Ollama에 허용해줘야 연결됩니다. 이 설정은 사이트가 아니라{" "}
          <b>Ollama를 실행하는 각자의 컴퓨터</b>에서 해야 합니다.
        </p>
      </Section>

      <PartHeader index="2" title="macOS에서 허용하기" />

      <Section id="macos-allow" title="3. 이 사이트 허용하기 (메뉴바 앱 기준)">
        <p className="rounded bg-amber-50 p-2 text-[13px] text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          ⚠️ macOS는 Windows·Linux와 달리 <Code>launchctl setenv</Code>만 실행하면 <b>맥을 껐다 켜거나 로그아웃하는 순간
          설정이 초기화</b>됩니다. 아래 &quot;방법 B&quot;로 한 번만 등록해두면 그럴 걱정 없이 계속 유지됩니다 — 이쪽을 추천합니다.
        </p>

        <p className="mt-3 font-medium text-gray-700 dark:text-gray-200">
          방법 A — 지금 바로 테스트만 해보고 싶다면 (재부팅하면 다시 해야 함)
        </p>
        <ol className="list-decimal space-y-3 pl-5">
          <li>
            터미널(Terminal.app)을 열고 아래 명령으로 이 사이트를 허용 목록에 등록합니다.
            <Block>{`launchctl setenv OLLAMA_ORIGINS "${site}"`}</Block>
          </li>
          <li>
            메뉴바의 Ollama 아이콘을 클릭해 <b>Quit Ollama</b>로 완전히 종료합니다.
          </li>
          <li>Spotlight(⌘+Space) 등으로 Ollama를 다시 실행합니다.</li>
        </ol>

        <p className="mt-4 font-medium text-gray-700 dark:text-gray-200">
          방법 B — 재부팅해도 계속 유지되게 하기 (한 번만 설정, 이후로는 신경 쓸 필요 없음 — 추천)
        </p>
        <ol className="list-decimal space-y-3 pl-5">
          <li>
            터미널을 열고 아래 명령을 통째로 복사해 붙여넣고 실행합니다. 맥이 로그인할 때마다 이 사이트를 자동으로 허용 목록에
            등록해주는 작은 설정 파일을 만드는 명령입니다.
            <Block>{`mkdir -p ~/Library/LaunchAgents
cat > ~/Library/LaunchAgents/com.ollama.setenv.plist <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.ollama.setenv</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/launchctl</string>
        <string>setenv</string>
        <string>OLLAMA_ORIGINS</string>
        <string>${site}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>
EOF
launchctl load ~/Library/LaunchAgents/com.ollama.setenv.plist`}</Block>
          </li>
          <li>
            메뉴바의 Ollama 아이콘을 클릭해 <b>Quit Ollama</b>로 완전히 종료한 뒤, Spotlight(⌘+Space)로 다시 실행합니다.
          </li>
          <li>끝입니다. 이후로는 맥을 껐다 켜거나 로그아웃해도 이 설정이 계속 자동으로 적용됩니다.</li>
        </ol>
      </Section>

      <Section id="macos-terminal" title="4. 터미널에서 직접 실행하는 방법">
        <p>메뉴바 앱 대신 터미널에서 직접 켜고 싶다면(이 경우 그 터미널 창을 닫으면 Ollama도 같이 꺼집니다):</p>
        <Block>{`OLLAMA_ORIGINS=${site} ollama serve`}</Block>
      </Section>

      <Section id="macos-error" title={`5. "address already in use" 에러가 뜬다면`}>
        <p>
          이미 다른 Ollama가 백그라운드에서 실행 중이라는 뜻입니다(대개 메뉴바 앱이 자동으로 켜져 있음). 메뉴바 아이콘에서
          먼저 <b>Quit Ollama</b>로 끈 뒤 다시 시도하세요. 메뉴바에 아이콘이 안 보이면 터미널에서 <Code>lsof -i :11434</Code>
          로 점유 중인 프로세스를 찾아 <Code>kill &lt;PID&gt;</Code>로 종료할 수 있습니다.
        </p>
      </Section>

      <Section id="macos-multi" title="6. 여러 사이트에서 계속 쓰고 싶다면">
        <p>매번 주소를 새로 등록하기 번거로우면 전부 허용해둘 수 있습니다(보안은 느슨해지지만 개인 컴퓨터 용도로는 괜찮습니다):</p>
        <Block>{`launchctl setenv OLLAMA_ORIGINS "*"`}</Block>
        <p>
          macOS에서는 이 값도 위 &quot;방법 B&quot;의 plist 안 <Code>{`<string>${site}</string>`}</Code> 자리에{" "}
          <Code>*</Code>를 넣으면 재부팅해도 유지됩니다.
        </p>
      </Section>

      <PartHeader index="3" title="Windows · Linux에서 허용하기" />

      <Section id="windows" title="7. Windows에서 설정하는 방법">
        <p>방법은 두 가지입니다. 둘 중 하나만 하면 됩니다.</p>

        <p className="mt-3 font-medium text-gray-700 dark:text-gray-200">방법 A — 설정 화면에서 (한 번만 하면 계속 유지됨, 추천)</p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            <b>Windows 키</b>를 누르고 <Code>환경 변수</Code>라고 입력한 뒤, 검색 결과에서 <b>&quot;계정의 환경 변수 편집&quot;</b>
            (또는 &quot;시스템 환경 변수 편집&quot;)을 클릭합니다.
          </li>
          <li>
            <b>환경 변수(N)...</b> 버튼을 클릭합니다.
          </li>
          <li>
            위쪽 <b>&quot;사용자 변수&quot;</b> 목록 아래의 <b>새로 만들기(N)...</b>를 클릭합니다.
          </li>
          <li>
            변수 이름에 <Code>OLLAMA_ORIGINS</Code>, 변수 값에 <Code>{site}</Code>를 입력하고 <b>확인</b>을 누릅니다. (창을 두 번 더
            &quot;확인&quot;으로 닫아 저장을 마칩니다.)
          </li>
          <li>
            작업 표시줄 오른쪽 아래 트레이에서 Ollama 아이콘을 우클릭해 <b>Quit Ollama</b>(또는 종료)를 선택합니다. 아이콘이 안
            보이면 <b>작업 관리자(Ctrl+Shift+Esc)</b>에서 &quot;Ollama&quot; 프로세스를 찾아 종료합니다.
          </li>
          <li>시작 메뉴에서 Ollama를 다시 실행합니다. 이후로는 컴퓨터를 재시작해도 이 설정이 계속 유지됩니다.</li>
        </ol>

        <p className="mt-3 font-medium text-gray-700 dark:text-gray-200">방법 B — PowerShell/명령 프롬프트에서 (방법 A와 결과는 동일)</p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            시작 메뉴에서 <Code>PowerShell</Code> 또는 <Code>cmd</Code>를 검색해 실행하고 아래 명령을 입력합니다.
            <Block>{`setx OLLAMA_ORIGINS "${site}"`}</Block>
            &quot;성공: 지정한 값을 저장했습니다.&quot;라는 메시지가 뜨면 등록된 것입니다.
          </li>
          <li>
            <b>이 창에는 바로 적용되지 않습니다</b> — <Code>setx</Code>는 그 이후에 새로 켜지는 프로그램부터 적용됩니다. 방법 A의
            4~5번과 마찬가지로 트레이나 작업 관리자에서 Ollama를 완전히 종료한 뒤 다시 실행해야 합니다.
          </li>
        </ol>
      </Section>

      <Section id="linux" title="8. Linux를 쓴다면">
        <p>
          systemd로 Ollama를 서비스 등록해뒀다면 서비스 파일에{" "}
          <Code>Environment=&quot;OLLAMA_ORIGINS={site}&quot;</Code>를 추가한 뒤 서비스를 재시작하면 됩니다. 터미널에서 직접
          띄운다면 macOS와 동일하게 <Code>OLLAMA_ORIGINS={site} ollama serve</Code>를 쓰면 됩니다.
        </p>
      </Section>

      <PartHeader index="4" title="그 외 방법" />

      <Section id="cloud" title="9. 터미널이 부담스럽다면">
        <p>
          프로젝트 화면 헤더의 &quot;설정&quot;에서 로컬 LLM 대신 OpenAI·Google Gemini·Claude 같은 클라우드 AI를 선택하고 API
          키만 입력하면, 이런 CORS 설정 없이 바로 사용할 수 있습니다.
        </p>
      </Section>
    </main>
  );
}
