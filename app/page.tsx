import Link from "next/link";
import type { CSSProperties } from "react";
import ThemeToggle from "@/components/ThemeToggle";

// 마케팅 랜딩 페이지. 실제 작업 화면(프로젝트 목록)은 /app으로 옮겨졌음 — 이 페이지의 CTA는 전부 그리로 연결됨.
// 인터랙션(진실 가리기/보기)은 JS 없이 순수 CSS(checkbox 해킹)로만 구현 — 서버 컴포넌트로 충분해서 "use client" 없음.

const GENRE_SHOWCASE: { label: string; color: string }[] = [
  { label: "회귀물", color: "#2E9E6F" },
  { label: "무협 판타지", color: "#3E8FC4" },
  { label: "로맨스 판타지", color: "#C6862A" },
  { label: "느와르", color: "#C4547A" },
  { label: "빙의물", color: "#7B6FCB" },
  { label: "게임판타지", color: "#2F9E9E" },
  { label: "오컬트", color: "#B6538E" },
  { label: "사이버펑크", color: "#C4732A" },
  { label: "첩보물", color: "#3E9BC4" },
  { label: "환생물", color: "#7B57C7" },
  { label: "사극·역사", color: "#2E9E6F" },
  { label: "디스토피아", color: "#C6862A" },
  { label: "학원물", color: "#C4547A" },
  { label: "일상물(힐링)", color: "#3E8FC4" },
  { label: "그 밖에 33가지 더", color: "#2F9E9E" },
];

const FEATURES: { icon: React.ReactNode; title: string; body: string }[] = [
  {
    icon: (
      <svg className="seal" viewBox="0 0 40 40" fill="none">
        <circle cx="20" cy="20" r="17" stroke="currentColor" strokeWidth="1.4" />
        <ellipse cx="20" cy="20" rx="8" ry="17" stroke="currentColor" strokeWidth="1.2" />
        <line x1="3" y1="20" x2="37" y2="20" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    ),
    title: "세계관 설계",
    body: "시대와 장소부터 법과 금기, 화폐와 속어까지. 17개 항목으로 세계의 뼈대를 세웁니다.",
  },
  {
    icon: (
      <svg className="seal" viewBox="0 0 40 40" fill="none">
        <rect x="4" y="8" width="22" height="15" rx="2" stroke="currentColor" strokeWidth="1.4" />
        <rect x="14" y="18" width="22" height="15" rx="2" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    ),
    title: "캐릭터 인터뷰",
    body: "캐릭터가 되어 대화하세요. 겉으로 하는 말과 속마음을 따로 확인할 수 있습니다.",
  },
  {
    icon: (
      <svg className="seal" viewBox="0 0 40 40" fill="none">
        <circle cx="10" cy="10" r="4" stroke="currentColor" strokeWidth="1.3" />
        <circle cx="30" cy="14" r="4" stroke="currentColor" strokeWidth="1.3" />
        <circle cx="16" cy="31" r="4" stroke="currentColor" strokeWidth="1.3" />
        <line x1="13" y1="12" x2="27" y2="14" stroke="currentColor" strokeWidth="1.2" />
        <line x1="11" y1="14" x2="15" y2="27" stroke="currentColor" strokeWidth="1.2" />
        <line x1="20" y1="30" x2="27" y2="17" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    ),
    title: "관계망 지도",
    body: "인물과 집단의 관계를 지도처럼 펼쳐두고, 소속과 감정의 온도를 드래그로 잇습니다.",
  },
  {
    icon: (
      <svg className="seal" viewBox="0 0 40 40" fill="none">
        <path d="M4 20 C4 11 12 6 20 6 C28 6 36 11 36 20 C31 22 28 24 20 24 C12 24 9 22 4 20Z" stroke="currentColor" strokeWidth="1.3" />
        <circle cx="20" cy="20" r="4.5" stroke="currentColor" strokeWidth="1.3" />
        <line x1="6" y1="22" x2="34" y2="22" stroke="currentColor" strokeWidth="1.3" />
      </svg>
    ),
    title: "사실과 비밀",
    body: "같은 사건도 아는 사람, 모르는 사람, 오해한 사람이 다릅니다. 설정이 어긋나지 않게 걸러줍니다.",
  },
  {
    icon: (
      <svg className="seal" viewBox="0 0 40 40" fill="none">
        <path d="M8 32 L26 6 L34 12 L16 34 Z" stroke="currentColor" strokeWidth="1.3" />
        <line x1="26" y1="6" x2="34" y2="12" stroke="currentColor" strokeWidth="1.3" />
        <line x1="8" y1="32" x2="16" y2="34" stroke="currentColor" strokeWidth="1.3" />
      </svg>
    ),
    title: "함께 쓰는 이야기",
    body: "다음 전개를 AI에게 제안받고, 이어 쓰고, 떡밥을 심고 회수한 지점까지 추적합니다.",
  },
  {
    icon: (
      <svg className="seal" viewBox="0 0 40 40" fill="none">
        <path d="M4 12 L16 12 L19 16 L36 16 L36 32 L4 32 Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
    ),
    title: "내 폴더에 그대로",
    body: "이야기가 바뀔 때마다 내 컴퓨터의 폴더에 조용히 저장됩니다. Obsidian 노트로도 바로 열립니다.",
  },
];

export default function Landing() {
  return (
    <div className="page">
      <style>{LANDING_CSS}</style>

      <nav className="top">
        <div className="wrap">
          <div className="wordmark">
            Persona<span className="dot">·</span>Studio
          </div>
          <div className="nav-links">
            <a href="#thesis">방식</a>
            <a href="#features">기능</a>
            <a href="#genres">장르</a>
            <ThemeToggle className="theme-toggle" />
            <Link className="btn btn-primary" href="/app" style={{ color: "#fff" }}>
              시작하기
            </Link>
          </div>
        </div>
      </nav>

      <header className="hero">
        <div className="wrap hero-grid">
          <div>
            <p className="eyebrow mono">세계관 · 인물 · 이야기 스튜디오</p>
            <h1>
              진실은 하나,
              <br />
              아는 사람은 <em>다르다.</em>
            </h1>
            <p className="lede">
              Persona Studio는 세계관과 인물, 그 사이의 관계를 설계하고 — 캐릭터가 되어 인터뷰하고, AI와 함께 이야기를
              이어 쓰는 도구입니다. 누가 무엇을 알고, 무엇을 오해하고 있는지까지 끝까지 살아있습니다.
            </p>
            <div className="cta-row">
              <Link className="btn btn-primary" href="/app">
                무료로 시작하기
              </Link>
              <a className="btn btn-ghost" href="#thesis">
                어떻게 다른지 보기 ↓
              </a>
            </div>
            <p className="cta-note" style={{ marginTop: "18px" }}>
              로컬 Ollama로 실행하면 계정도, 결제도 필요 없습니다.
            </p>
          </div>

          <div className="dossier">
            <div className="dossier-head">
              <span>인물 조서</span>
              <span className="no mono">NO. 0031</span>
            </div>
            <dl>
              <dt>이름</dt>
              <dd>선아</dd>
              <dt>소속</dt>
              <dd>흑풍회</dd>
              <dt>공개된 사실</dt>
              <dd>3년 전 항구 창고 화재의 배후</dd>
            </dl>
            <p className="fact-label">선아가 알고 있는 것 — 클릭하면 확인</p>
            <label className="reveal" htmlFor="reveal-1">
              <input type="checkbox" id="reveal-1" />
              <span className="reveal-window">
                <span className="reveal-text">사실 아무것도 모른다 — 오히려 준호를 의심하고 있다.</span>
                <span className="reveal-bar" aria-hidden="true">
                  ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
                </span>
              </span>
              <span className="reveal-cta">▸ 진실 확인하기</span>
            </label>
          </div>
        </div>
      </header>

      <section id="thesis">
        <div className="wrap thesis-grid">
          <div>
            <p className="eyebrow mono">왜 다른가</p>
            <h2 style={{ marginBottom: "20px" }}>
              기억하는 도구가 아니라,
              <br />
              감춰두는 도구.
            </h2>
            <p>
              대부분의 AI 라이팅 도구는 설정을 하나의 텍스트 뭉치로 밀어 넣습니다. 그러면 모든 캐릭터가 작가만큼 많이
              알아버립니다.
            </p>
            <p>
              Persona Studio는 사실 하나하나에 <strong>누가 아는지, 누가 오해하는지</strong>를 붙입니다. 인터뷰하거나
              이야기를 이어 쓸 때, 그 인물이 실제로 알 수 있는 것만 골라 전달됩니다. 반전은 설정이 아니라 정보
              설계에서 나옵니다.
            </p>
          </div>
          <div className="web-card">
            <svg viewBox="0 0 320 220" fill="none">
              <line x1="70" y1="60" x2="230" y2="50" stroke="var(--thread)" strokeWidth="1.5" />
              <line x1="70" y1="60" x2="90" y2="170" strokeDasharray="4 5" stroke="var(--magenta)" strokeWidth="1.5" />
              <line x1="230" y1="50" x2="250" y2="165" stroke="var(--thread)" strokeWidth="1.5" />
              <line x1="90" y1="170" x2="250" y2="165" strokeDasharray="4 5" stroke="var(--gold)" strokeWidth="1.5" />
              <line x1="70" y1="60" x2="250" y2="165" stroke="var(--magenta)" strokeWidth="1.5" markerEnd="url(#arrow)" />
              <defs>
                <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                  <path d="M0,0 L6,3 L0,6 Z" fill="var(--magenta)" />
                </marker>
              </defs>
              <circle cx="70" cy="60" r="20" fill="var(--surface-2)" stroke="var(--text-dim)" />
              <circle cx="230" cy="50" r="20" fill="var(--surface-2)" stroke="var(--text-dim)" />
              <circle cx="90" cy="170" r="20" fill="var(--surface-2)" stroke="var(--text-dim)" />
              <circle cx="250" cy="165" r="20" fill="var(--surface-2)" stroke="var(--text-dim)" />
              <text x="70" y="65" textAnchor="middle" fontSize="11" fill="var(--text)">선아</text>
              <text x="230" y="55" textAnchor="middle" fontSize="11" fill="var(--text)">준호</text>
              <text x="90" y="175" textAnchor="middle" fontSize="11" fill="var(--text)">흑풍회</text>
              <text x="250" y="170" textAnchor="middle" fontSize="11" fill="var(--text)">유진</text>
            </svg>
            <div className="web-legend">
              <span>
                <svg><line x1="0" y1="5" x2="28" y2="5" stroke="var(--thread)" strokeWidth="1.5" /></svg>
                서로 아는 사이
              </span>
              <span>
                <svg><line x1="0" y1="5" x2="28" y2="5" strokeDasharray="4 5" stroke="var(--gold)" strokeWidth="1.5" /></svg>
                한쪽만 아는 사이
              </span>
              <span>
                <svg>
                  <line x1="0" y1="5" x2="24" y2="5" stroke="var(--magenta)" strokeWidth="1.5" />
                  <path d="M24,2 L28,5 L24,8 Z" fill="var(--magenta)" />
                </svg>
                짝사랑 · 단방향 감정
              </span>
            </div>
          </div>
        </div>
      </section>

      <section id="features">
        <div className="wrap">
          <div className="section-head">
            <p className="eyebrow mono">할 수 있는 것</p>
            <h2>세계관부터 마지막 문장까지</h2>
            <p>세계를 세우고, 인물을 만나고, 관계를 잇고, 이야기를 써 내려가는 흐름을 하나로.</p>
          </div>
          <div className="features">
            {FEATURES.map((f) => (
              <div className="feature" key={f.title}>
                {f.icon}
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="section-head">
            <p className="eyebrow mono">시작하는 순서</p>
            <h2>세 걸음이면 충분합니다</h2>
          </div>
          <div className="flow">
            <div className="flow-step">
              <span className="num mono">01</span>
              <h3>세계관을 적는다</h3>
              <p>시대, 권력 구조, 금기, 화폐 — 이야기가 기댈 수 있는 만큼만 먼저 세웁니다.</p>
            </div>
            <div className="flow-step">
              <span className="num mono">02</span>
              <h3>인물을 만난다</h3>
              <p>캐릭터를 인터뷰하며 성격과 말투를 다듬고, 관계망 위에 다른 인물·집단과 잇습니다.</p>
            </div>
            <div className="flow-step">
              <span className="num mono">03</span>
              <h3>이야기를 잇는다</h3>
              <p>AI가 다음 전개를 제안하면 고르거나 직접 씁니다. 설정은 자동으로 지켜집니다.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="genres">
        <div className="wrap">
          <div className="section-head">
            <p className="eyebrow mono">장르는 가리지 않습니다</p>
            <h2>회귀물이든, 정통 판타지든</h2>
            <p>39가지 장르 프리셋을 여러 개 겹쳐 고를 수 있습니다. 목록에 없다면 직접 만드세요.</p>
          </div>
          <div className="genre-cloud">
            {GENRE_SHOWCASE.map((g) => (
              <span className="genre-tag" key={g.label} style={{ "--tag-c": g.color } as CSSProperties}>
                {g.label}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="start">
        <div className="wrap">
          <div className="start-card">
            <div>
              <h2>설치도, 결제도 없이.</h2>
              <p>
                로컬 Ollama를 쓰면 API 키도 카드 등록도 필요 없습니다. OpenAI·Gemini·Claude로 바꾸고 싶다면 내 키만
                넣으면 바로 전환됩니다.
              </p>
            </div>
            <Link className="btn btn-primary" href="/app">
              지금 시작하기
            </Link>
          </div>
        </div>
      </section>

      <footer>
        <div className="wrap">
          <div className="wordmark" style={{ fontSize: "0.95rem" }}>
            Persona<span className="dot">·</span>Studio
          </div>
          <p>이야기를 짓는 사람들을 위한 조용한 스튜디오.</p>
        </div>
      </footer>
    </div>
  );
}

const LANDING_CSS = `
  .page {
    --bg: #ECEDF1;
    --surface: #FFFFFF;
    --surface-2: #F4F3F6;
    --text: #1B1720;
    --text-dim: #5B5566;
    --magenta: #B5104C;
    --gold: #96690C;
    --thread: #9C8AA0;
    --border: rgba(27,23,32,0.14);
    --redact: #1B1720;
    --shadow: 0 1px 2px rgba(27,23,32,0.06), 0 12px 32px -18px rgba(27,23,32,0.35);
    position: relative;
    overflow-x: clip;
    min-height: 100vh;
    background: var(--bg);
    color: var(--text);
    font-family: "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    font-size: 16px;
    line-height: 1.65;
    -webkit-font-smoothing: antialiased;
  }
  @media (prefers-color-scheme: dark) {
    .page {
      --bg: #14121A;
      --surface: #1F1B26;
      --surface-2: #241F2C;
      --text: #EDE7E3;
      --text-dim: #B0A5B8;
      --magenta: #EA4C82;
      --gold: #E3B24B;
      --thread: #9A87A0;
      --border: rgba(237,231,227,0.14);
      --redact: #0A090D;
      --shadow: 0 1px 2px rgba(0,0,0,0.4), 0 24px 48px -24px rgba(0,0,0,0.6);
    }
  }
  :root[data-theme="dark"] .page {
    --bg: #14121A; --surface: #1F1B26; --surface-2: #241F2C; --text: #EDE7E3; --text-dim: #B0A5B8;
    --magenta: #EA4C82; --gold: #E3B24B; --thread: #9A87A0; --border: rgba(237,231,227,0.14); --redact: #0A090D;
    --shadow: 0 1px 2px rgba(0,0,0,0.4), 0 24px 48px -24px rgba(0,0,0,0.6);
  }
  :root[data-theme="light"] .page {
    --bg: #ECEDF1; --surface: #FFFFFF; --surface-2: #F4F3F6; --text: #1B1720; --text-dim: #5B5566;
    --magenta: #B5104C; --gold: #96690C; --thread: #9C8AA0; --border: rgba(27,23,32,0.14); --redact: #1B1720;
    --shadow: 0 1px 2px rgba(27,23,32,0.06), 0 12px 32px -18px rgba(27,23,32,0.35);
  }

  .page * { box-sizing: border-box; }
  .page h1, .page h2, .page h3 {
    font-family: "Nanum Myeongjo", "Apple Myungjo", Georgia, "Noto Serif KR", serif;
    font-weight: 700;
    text-wrap: balance;
    margin: 0;
  }
  .page a { color: inherit; text-decoration: none; }
  .page .mono { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; letter-spacing: 0.08em; }

  .page::before {
    content: "";
    position: fixed;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    opacity: 0.035;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>");
  }

  .page .wrap { position: relative; z-index: 1; max-width: 1120px; margin: 0 auto; padding: 0 clamp(20px, 5vw, 56px); }

  .page nav.top {
    position: sticky; top: 0; z-index: 20;
    backdrop-filter: blur(10px);
    background: color-mix(in srgb, var(--bg) 82%, transparent);
    border-bottom: 1px solid var(--border);
  }
  .page nav.top .wrap { display: flex; align-items: center; justify-content: space-between; padding-top: 16px; padding-bottom: 16px; }
  .page .wordmark { display: flex; align-items: baseline; gap: 8px; font-family: "Nanum Myeongjo", Georgia, serif; font-size: 1.15rem; font-weight: 700; }
  .page .wordmark .dot { color: var(--magenta); }
  .page .nav-links { display: flex; align-items: center; gap: clamp(16px, 3vw, 32px); font-size: 0.9rem; color: var(--text-dim); }
  .page .nav-links a:hover { color: var(--text); }
  .page .theme-toggle {
    display: inline-flex; align-items: center; justify-content: center;
    width: 30px; height: 30px; border-radius: 999px; border: 1px solid var(--border);
    font-size: 0.95rem; line-height: 1; transition: border-color 0.15s ease;
  }
  .page .theme-toggle:hover { border-color: var(--text-dim); }
  .page .btn {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 10px 20px;
    border-radius: 3px;
    font-size: 0.92rem; font-weight: 600;
    border: 1px solid transparent;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }
  .page .btn:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
  .page .btn-primary { background: var(--magenta); color: #fff; }
  .page .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 8px 20px -8px var(--magenta); }
  .page .btn-ghost { border-color: var(--border); color: var(--text); }
  .page .btn-ghost:hover { border-color: var(--text-dim); }
  @media (prefers-reduced-motion: reduce) { .page .btn { transition: none; } .page .btn-primary:hover { transform: none; } }

  .page .hero { padding: clamp(56px, 9vw, 120px) 0 clamp(48px, 7vw, 88px); }
  .page .hero-grid { display: grid; grid-template-columns: 1.15fr 0.85fr; gap: clamp(32px, 6vw, 72px); align-items: start; }
  @media (max-width: 900px) { .page .hero-grid { grid-template-columns: 1fr; } }

  .page .eyebrow {
    display: inline-flex; align-items: center; gap: 10px;
    font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.16em;
    color: var(--magenta); margin-bottom: 22px;
  }
  .page .eyebrow::before { content: ""; width: 20px; height: 1px; background: currentColor; opacity: 0.6; }

  .page .hero h1 { font-size: clamp(2.15rem, 3.6vw + 1rem, 3.6rem); line-height: 1.18; letter-spacing: -0.01em; }
  .page .hero h1 em { font-style: normal; color: var(--magenta); }
  .page .hero p.lede { margin: 26px 0 34px; max-width: 46ch; color: var(--text-dim); font-size: 1.08rem; }
  .page .hero .cta-row { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
  .page .hero .cta-note { font-size: 0.85rem; color: var(--text-dim); }

  .page .dossier {
    position: relative;
    background: var(--surface);
    border: 1px solid var(--border);
    box-shadow: var(--shadow);
    padding: 28px 26px 26px;
    clip-path: polygon(0 0, calc(100% - 26px) 0, 100% 26px, 100% 100%, 0 100%);
  }
  .page .dossier::after {
    content: "";
    position: absolute; top: 0; right: 0;
    width: 0; height: 0;
    border-style: solid;
    border-width: 0 26px 26px 0;
    border-color: transparent var(--bg) transparent transparent;
  }
  .page .dossier-head {
    display: flex; justify-content: space-between; align-items: center;
    font-size: 0.68rem; letter-spacing: 0.14em; text-transform: uppercase;
    color: var(--text-dim); border-bottom: 1px dashed var(--border);
    padding-bottom: 14px; margin-bottom: 18px;
  }
  .page .dossier-head span.no { color: var(--gold); }
  .page .dossier dl { display: grid; grid-template-columns: auto 1fr; gap: 8px 16px; margin: 0 0 18px; font-size: 0.92rem; }
  .page .dossier dt { color: var(--text-dim); }
  .page .dossier dd { margin: 0; }
  .page .dossier .fact-label { font-size: 0.75rem; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.08em; margin: 20px 0 8px; }

  .page .reveal { display: block; cursor: pointer; }
  .page .reveal input {
    position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
    overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0;
  }
  .page .reveal-window { position: relative; display: block; padding: 10px 12px; background: var(--surface-2); border-radius: 2px; }
  .page .reveal-text { display: block; font-size: 0.94rem; line-height: 1.5; }
  .page .reveal-bar {
    position: absolute; inset: 10px 12px;
    background: var(--redact); color: var(--redact);
    display: flex; align-items: center;
    letter-spacing: 0.14em; border-radius: 1px;
    transition: opacity 0.4s ease;
  }
  .page .reveal input:checked ~ .reveal-window .reveal-bar { opacity: 0; pointer-events: none; }
  .page .reveal input:focus-visible ~ .reveal-window { outline: 2px solid var(--gold); outline-offset: 3px; }
  .page .reveal-cta { display: block; margin-top: 10px; font-size: 0.78rem; color: var(--gold); }
  .page .reveal input:checked ~ .reveal-cta { opacity: 0; }
  @media (prefers-reduced-motion: reduce) { .page .reveal-bar { transition: none; } }

  .page section { padding: clamp(56px, 8vw, 104px) 0; border-top: 1px solid var(--border); }
  .page .section-head { max-width: 640px; margin-bottom: clamp(32px, 5vw, 56px); }
  .page .section-head .eyebrow { color: var(--gold); }
  .page .section-head h2 { font-size: clamp(1.55rem, 2vw + 1rem, 2.15rem); }
  .page .section-head p { color: var(--text-dim); margin-top: 14px; font-size: 1rem; }

  .page .thesis-grid { display: grid; grid-template-columns: 1fr 1fr; gap: clamp(28px, 5vw, 64px); align-items: center; }
  @media (max-width: 860px) { .page .thesis-grid { grid-template-columns: 1fr; } }
  .page .thesis-grid p { color: var(--text-dim); font-size: 1.02rem; }
  .page .thesis-grid p + p { margin-top: 16px; }
  .page .thesis-grid strong { color: var(--text); font-weight: 700; }

  .page .web-card { background: var(--surface); border: 1px solid var(--border); box-shadow: var(--shadow); padding: 24px; }
  .page .web-card svg { width: 100%; height: auto; display: block; }
  .page .web-legend { display: flex; flex-wrap: wrap; gap: 14px 22px; margin-top: 18px; font-size: 0.78rem; color: var(--text-dim); }
  .page .web-legend span { display: inline-flex; align-items: center; gap: 8px; }
  .page .web-legend svg { width: 28px; height: 10px; flex-shrink: 0; }

  .page .features { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; background: var(--border); border: 1px solid var(--border); }
  @media (max-width: 860px) { .page .features { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 560px) { .page .features { grid-template-columns: 1fr; } }
  .page .feature { background: var(--surface); padding: 30px 26px; }
  .page .feature .seal { width: 40px; height: 40px; color: var(--magenta); margin-bottom: 18px; }
  .page .feature h3 { font-family: "Apple SD Gothic Neo", "Noto Sans KR", sans-serif; font-size: 1.02rem; font-weight: 700; margin-bottom: 10px; }
  .page .feature p { margin: 0; font-size: 0.92rem; color: var(--text-dim); }

  .page .flow { display: grid; grid-template-columns: repeat(3, 1fr); gap: clamp(20px, 4vw, 36px); }
  @media (max-width: 760px) { .page .flow { grid-template-columns: 1fr; } }
  .page .flow-step { position: relative; padding-top: 8px; }
  .page .flow-step .num { font-family: "Nanum Myeongjo", Georgia, serif; font-size: 0.85rem; color: var(--gold); margin-bottom: 12px; display: block; }
  .page .flow-step h3 { font-size: 1.15rem; margin-bottom: 10px; }
  .page .flow-step p { color: var(--text-dim); font-size: 0.94rem; margin: 0; }

  .page .genre-cloud { display: flex; flex-wrap: wrap; gap: 10px; }
  .page .genre-tag {
    font-size: 0.85rem; padding: 7px 14px; border-radius: 999px;
    border: 1px solid var(--tag-c, var(--border));
    color: var(--tag-c, var(--text-dim));
  }

  .page .start-card {
    background: var(--surface); border: 1px solid var(--border); box-shadow: var(--shadow);
    padding: clamp(32px, 5vw, 56px); display: flex; align-items: center; justify-content: space-between; gap: 32px; flex-wrap: wrap;
  }
  .page .start-card h2 { font-size: clamp(1.4rem, 2vw + 1rem, 1.9rem); max-width: 30ch; }
  .page .start-card p { color: var(--text-dim); margin-top: 12px; max-width: 42ch; }

  .page footer { padding: 36px 0 56px; }
  .page footer .wrap { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; }
  .page footer p { margin: 0; font-size: 0.82rem; color: var(--text-dim); }
`;
