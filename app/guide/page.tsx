import Link from "next/link";
import type { ReactNode } from "react";

const Code = ({ children }: { children: ReactNode }) => (
  <code className="rounded bg-gray-100 px-1 py-0.5 text-[13px] dark:bg-gray-900">{children}</code>
);

// 15개 절을 다시 훑기 쉽도록 4부로 묶음 — 목차와 본문 구분선(PartHeader) 양쪽에서 이 구조를 그대로 씀
const TOC: { part: string; items: { id: string; label: string }[] }[] = [
  {
    part: "시작하기",
    items: [
      { id: "start", label: "1. 시작하기" },
      { id: "ai", label: "2. AI 연결하기" },
      { id: "genre", label: "3. 장르 고르기" },
    ],
  },
  {
    part: "세계와 인물 설계",
    items: [
      { id: "world", label: "4. 세계관 만들기" },
      { id: "facts", label: "5. 사실과 비밀" },
      { id: "personas", label: "6. 캐릭터 만들기" },
      { id: "groups", label: "7. 집단 만들기" },
      { id: "relations", label: "8. 관계 설정하기" },
    ],
  },
  {
    part: "이야기 진행",
    items: [
      { id: "interview", label: "9. 캐릭터 인터뷰" },
      { id: "pending", label: "10. 제안된 설정 승인하기" },
      { id: "story", label: "11. 이야기 함께 쓰기" },
      { id: "foreshadow", label: "12. 떡밥 관리" },
    ],
  },
  {
    part: "관리와 백업",
    items: [
      { id: "trash", label: "13. 삭제와 복구" },
      { id: "autosave", label: "14. 저장 폴더 연결과 자동 저장" },
      { id: "obsidian", label: "15. 다른 컴퓨터에서 이어보기" },
    ],
  },
];

const GUIDE_CSS = `
  .guide-serif { font-family: "Nanum Myeongjo", "Apple Myungjo", Georgia, "Noto Serif KR", serif; letter-spacing: -0.01em; }
  .guide-eyebrow {
    display: inline-flex; align-items: center; gap: 8px;
    font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.16em;
    color: #d946ef; margin-bottom: 6px;
  }
  .guide-eyebrow::before { content: ""; width: 16px; height: 1px; background: currentColor; opacity: 0.6; }
`;

function PartHeader({ index, title }: { index: string; title: string }) {
  return (
    <div className="mt-14 first:mt-10">
      <p className="guide-eyebrow">PART {index}</p>
      <h2 className="guide-serif text-2xl font-bold">{title}</h2>
      <div className="mt-4 border-t border-gray-200 dark:border-gray-800" />
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="mt-8 scroll-mt-6">
      <h3 className="text-lg font-bold">{title}</h3>
      <div className="mt-2 space-y-2 text-gray-600 dark:text-gray-300">{children}</div>
    </section>
  );
}

export default function GuidePage() {
  return (
    <main className="mx-auto max-w-3xl p-8 text-sm leading-relaxed">
      <style>{GUIDE_CSS}</style>
      <Link href="/app" className="text-gray-400 hover:underline">
        ← 홈으로
      </Link>
      <h1 className="guide-serif mt-2 text-3xl font-bold">사용법</h1>
      <p className="mt-2 text-gray-500">
        세계관을 세우고, 캐릭터를 만나고, 이야기를 함께 써 내려가기까지 — Persona Studio의 모든 기능을 순서대로
        설명합니다. 처음이라면 위에서부터 그대로 따라 해보세요.
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

      <PartHeader index="1" title="시작하기" />
      <Section id="start" title="1. 시작하기">
        <p>
          <Link href="/app" className="text-fuchsia-600 hover:underline dark:text-fuchsia-400">
            메인 화면
          </Link>
          에서 새 프로젝트 이름을 입력하고 <Code>만들기</Code>를 누르면 프로젝트가 하나 생깁니다. 프로젝트 하나가 세계관
          하나, 이야기 하나에 해당합니다 — 여러 세계를 동시에 만들고 싶다면 프로젝트를 여러 개 만들면 됩니다.
        </p>
        <p>
          만든 프로젝트를 클릭해서 열면, 화면 가운데는 <Code>관계도</Code>가 지도처럼 항상 떠 있고, 그 아래는 항상 열려
          있는 <Code>이야기 쓰기</Code> 창이 있습니다. 나머지 기능(세계관·캐릭터·집단·사실 등)은 상단 탭을 눌러 팝업으로
          엽니다.
        </p>
      </Section>

      <Section id="ai" title="2. AI 연결하기">
        <p>
          헤더의 <Code>설정</Code> 버튼에서 캐릭터 인터뷰·이야기 생성에 쓸 AI를 고릅니다.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <b>로컬 LLM(Ollama)</b> — 계정도 결제도 필요 없습니다. 이 컴퓨터에 Ollama를 설치하고 모델을 받아두면
            브라우저가 직접 그 Ollama로 접속합니다. 처음이라면{" "}
            <Link href="/ollama-setup" className="text-fuchsia-600 hover:underline dark:text-fuchsia-400">
              로컬 LLM 연동 설정
            </Link>
            을 따라 하세요. 사이트가 배포된 주소에서 접속 중이라면 CORS 설정이 한 번 필요합니다(그 페이지에 자세히
            나와 있습니다).
          </li>
          <li>
            <b>OpenAI · Google Gemini · Claude</b> — 각 서비스의 API 키를 발급받아 넣으면 바로 전환됩니다. Gemini는
            키를 입력한 뒤 <Code>목록 불러오기</Code>를 누르면 그 키로 실제 쓸 수 있는 모델 목록이 드롭다운으로
            뜹니다 — 모델 이름을 외우거나 추측할 필요가 없습니다. 사용량에 따라 각 서비스에 비용이 청구될 수 있으니
            요금제를 먼저 확인하세요.
          </li>
        </ul>
        <p>이 설정은 프로젝트가 아니라 이 브라우저 전체에 저장되어, 어떤 프로젝트를 열어도 같은 설정을 씁니다.</p>
      </Section>

      <Section id="genre" title="3. 장르 고르기">
        <p>
          <Code>장르</Code> 탭에서 원하는 장르 카드를 눌러 고릅니다. <b>여러 개를 동시에 선택</b>할 수 있습니다(예:
          &quot;무협&quot;+&quot;로맨스&quot;). 다시 누르면 선택이 풀리고, 카드 목록 위의 <Code>선택 해제</Code>로 한 번에 전부 끌 수
          있습니다. 목록에 없는 장르는 <Code>기타 (직접 입력)</Code> 카드를 눌러 이름을 직접 적으면 됩니다.
        </p>
        <p>
          아래 <Code>기타 설정</Code>에는 장르 자체가 아니라 그 장르 안에서 지키거나 피하고 싶은 관습, 참고하고 싶은
          분위기·작품을 자유롭게 적습니다. 여기서 고른 장르와 메모는 인터뷰·이야기 생성 AI에게 그대로 전달됩니다.
        </p>
      </Section>

      <PartHeader index="2" title="세계와 인물 설계" />
      <Section id="world" title="4. 세계관 만들기">
        <p>
          <Code>세계관</Code> 탭은 시대·자연 법칙·힘의 근원·지배 구조·법과 징벌·지리·경제·역사·금기·종교·속어 등 17개
          항목으로 나뉩니다. 전부 채울 필요는 없습니다 — 이야기에 실제로 영향을 줄 항목만 먼저 채우고, 나머지는
          비워둬도 됩니다. 여기 적은 내용은 인터뷰와 이야기 생성 프롬프트에 그대로 반영됩니다.
        </p>
      </Section>

      <Section id="facts" title="5. 사실과 비밀">
        <p>
          이 도구의 핵심 기능입니다. <Code>사실·비밀</Code> 탭에서 사건이나 진실을 하나 적고, 그 아래에서 캐릭터별로{" "}
          <b>이 사실을 아는지 · 모르는지 · 오해하고 있는지</b>를 따로 지정합니다.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <b>모름</b>(기본값) — 아무 지정도 안 하면 그 캐릭터는 이 사실을 전혀 모르는 것으로 취급됩니다.
          </li>
          <li>
            <b>앎</b> — 이 캐릭터의 인터뷰·이야기 프롬프트에 이 사실이 그대로 들어갑니다. &quot;언제부터 알게 됐는지&quot;를
            챕터로 지정하면, 이야기가 그 챕터에 도달하기 전까지는 여전히 모르는 것으로 취급됩니다(스포일러 방지).
          </li>
          <li>
            <b>오해함</b> — 진짜 사실 대신, 직접 적은 잘못된 믿음이 그 캐릭터의 프롬프트에 들어갑니다. 예: 진짜는
            &quot;준호가 범인&quot;인데 어떤 캐릭터는 &quot;영희가 범인이라고 믿음&quot;으로 지정.
          </li>
        </ul>
        <p>
          같은 사건도 인물마다 다르게 알고 있으니, 인터뷰나 이야기 전개에서 자연스럽게 오해·반전·정보 격차가
          생깁니다.
        </p>
      </Section>

      <Section id="personas" title="6. 캐릭터 만들기">
        <p>
          <Code>캐릭터</Code> 탭에서 이름을 적고 <Code>추가</Code>를 누르면 생성됩니다. 이미 만든 집단이 있다면 생성과
          동시에 소속 집단을 체크할 수 있습니다.
        </p>
        <p>
          캐릭터 상세에는 나이·직업·외형·성격·가치관·말투·배경·목표·트리거 외에도{" "}
          <b>과거·현재·미래에 무엇을 지향해왔는지</b>를 따로 적는 항목이 있습니다(배경 서사·현재 목표와는 별개로,
          삶의 방향성 자체를 기록하는 항목). 소속 집단도 이 화면에서 체크박스로 켜고 끌 수 있습니다.
        </p>
        <p>
          <Code>디자인 업로드</Code>로 캐릭터 이미지를 넣을 수 있고, 업로드 후에는 가로·세로 슬라이더로 정사각형
          미리보기에서 어느 부분을 보여줄지(자르기 위치) 조정할 수 있습니다. 관계도의 원형 아바타에도 같은 자르기가
          적용됩니다.
        </p>
      </Section>

      <Section id="groups" title="7. 집단 만들기">
        <p>
          <Code>집단</Code> 탭에서 이름과 설명을 적고, 필요하면 <b>상위 집단</b>을 지정해 &quot;학교 &gt; 1학년 &gt; 1반&quot;
          같은 트리 구조를 만들 수 있습니다(자기 자신이나 자손을 상위로 지정하는 순환은 자동으로 막힙니다). 상위
          집단을 지정하면 그 둘 사이에 기본 관계(중립, 서로 앎)가 자동으로 하나 생기는데, 비밀 하부 조직처럼 표현하고
          싶다면 <Code>관계</Code> 탭에서 이 관계를 &quot;모름&quot;으로 바꾸면 됩니다.
        </p>
      </Section>

      <Section id="relations" title="8. 관계 설정하기">
        <p>
          <Code>관계</Code> 탭에서 세 종류의 관계를 다룹니다.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li><b>캐릭터 간 관계</b> — 점수(1~100)와 서로의 존재를 아는지, 양방향인지 단방향(짝사랑 등)인지.</li>
          <li><b>집단 간 관계</b> — 두 집단 사이의 감정 온도.</li>
          <li>
            <b>캐릭터-집단 관계</b> — 소속 여부와는 완전히 무관합니다. 소속 멤버끼리도, 전혀 상관없는 외부인도 가질
            수 있고, &quot;캐릭터는 이 집단을 모르는데 집단(조직)은 이 캐릭터를 감시하고 있다&quot;처럼 <b>양쪽이 다르게</b>{" "}
            알 수 있습니다.
          </li>
        </ul>
        <p>
          관계도 지도에서 같은 종류의 노드(캐릭터↔캐릭터, 집단↔집단)를 서로 위로 드래그하면 기본값으로 관계가 즉석에서
          생기거나 지워집니다. 캐릭터를 집단 위로 드래그하면 소속이 토글됩니다. 노드를 클릭(드래그 아님)하면 그
          항목의 설정 화면이 바로 열립니다.
        </p>
      </Section>

      <PartHeader index="3" title="이야기 진행" />
      <Section id="interview" title="9. 캐릭터 인터뷰">
        <p>
          <Code>인터뷰</Code> 탭에서 캐릭터를 골라 대화합니다. <b>페르소나 강도</b>를 1~4로 조절할 수 있습니다:
          설정 참고(자유롭게 브레인스토밍) → 성격 유지 → 엄격한 역할 수행(설정 밖 추측 금지) → 완전 몰입(AI라는 사실을
          절대 드러내지 않음). <b>시점</b>을 특정 챕터로 지정하면, &quot;중간에 알게 됨&quot;으로 표시한 사실은 그 챕터
          이전에는 여전히 모르는 것으로 취급됩니다.
        </p>
        <p>
          캐릭터의 답변은 겉으로 하는 말과 <b>속마음</b>이 함께 표시됩니다. 대화 중 AI가 새로운 설정(예: 몰랐던
          습관이나 취향)을 제안하면 바로 반영되지 않고 <Code>승인함</Code> 탭에 쌓입니다.
        </p>
      </Section>

      <Section id="pending" title="10. 제안된 설정 승인하기">
        <p>
          인터뷰 중 AI가 만든 새 설정은 <Code>승인함</Code> 탭에 모입니다. <Code>승인</Code>을 누르면 그 캐릭터의
          공식 설정(추가 설정 목록)에 반영되고, <Code>거절</Code>을 누르면 사라집니다. 승인하기 전까지는 다른 곳에
          영향을 주지 않습니다.
        </p>
      </Section>

      <Section id="story" title="11. 이야기 함께 쓰기">
        <p>
          관계도 아래 항상 열려 있는 <Code>이야기 쓰기</Code> 창에서 진행합니다. <b>이야기 쓰기는 전지적 시점</b>으로
          동작해서 인터뷰와 달리 세계관·전체 인물·전체 집단·모든 관계와 사실을 다 알고 씁니다.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <Code>다음 상황 제안받기</Code> — 지금까지 내용을 참고해 서로 다른 전개 3가지를 제안받고, 하나를 골라 바로
            이어 씁니다.
          </li>
          <li>
            직접 입력창에 <span className="italic">원하는 전개를 직접 입력해 이어서 쓰기</span>도 가능합니다.
          </li>
          <li>
            왼쪽 챕터 구성에서 챕터(막/장)를 만들고 클릭하면, 그 챕터에 태그된 내용만 필터링해서 보고 이어 쓸 수
            있습니다. 챕터마다 서술 시점(전지적 작가 / 3인칭 관찰자 / 1인칭 주인공 / 1인칭 관찰자)을 프로젝트
            기본값과 다르게 지정할 수도 있습니다.
          </li>
          <li>
            각 지점은 순서를 바꾸거나, 편집하거나, 삭제할 수 있습니다(지워도 <Code>↩ 되돌리기</Code>로 복구 가능 —
            단, 새로고침하면 되돌리기 기록은 사라집니다).
          </li>
        </ul>
      </Section>

      <Section id="foreshadow" title="12. 떡밥 관리">
        <p>
          이야기를 쓰다가 나중에 회수하고 싶은 문구를 마우스로 선택하면 뜨는 메뉴에서 &quot;떡밥으로 설정&quot;할 수 있습니다.
          나중에 그 사건이 밝혀지는 문구를 다시 선택해서 &quot;회수&quot;로 표시하면, <Code>떡밥</Code> 탭에서 설정 지점과 회수
          지점, 아직 회수 안 된 떡밥까지 한눈에 확인할 수 있습니다. 목록의 각 지점을 클릭하면 이야기 쓰기 창이 그
          지점으로 스크롤되며 잠깐 강조됩니다.
        </p>
      </Section>

      <PartHeader index="4" title="관리와 백업" />
      <Section id="trash" title="13. 삭제와 복구">
        <p>
          캐릭터나 집단을 삭제해도 실제로는 <Code>삭제됨</Code> 탭으로만 옮겨갑니다 — 소속, 관계, 사실 접근 정보 등
          연결된 데이터는 그대로 보존됩니다. <Code>복구</Code>를 누르면 모든 연결이 즉시 되살아나고,{" "}
          <Code>영구 삭제</Code>를 눌러야 실제로 사라집니다.
        </p>
      </Section>

      <Section id="autosave" title="14. 저장 폴더 연결과 자동 저장">
        <p>
          <Link href="/app" className="text-fuchsia-600 hover:underline dark:text-fuchsia-400">
            메인 화면
          </Link>
          에서 <Code>저장 폴더 선택</Code>으로 내 컴퓨터의 폴더 하나를 연결해두면(Chrome·Edge 전용), 그 뒤로 만드는
          새 프로젝트마다 그 폴더 안에 프로젝트 이름의 폴더가 자동으로 생깁니다. 프로젝트를 열어 이야기를 쓰다 보면
          — 새로 쓰거나, 고치거나, 지우거나, 순서를 바꿀 때마다 — 그 폴더에 조용히 자동으로 저장됩니다. 버튼을 따로
          누를 필요가 없습니다.
        </p>
        <p>
          프로젝트 화면 우측 상단의 배지로 지금 자동 저장이 켜져 있는지 확인할 수 있습니다. 브라우저를 완전히 새로
          열면 폴더 접근 권한이 풀릴 수 있는데, 이때는 배지가 <Code>다시 연결</Code>로 바뀌니 클릭 한 번으로
          복구하면 됩니다.
        </p>
      </Section>

      <Section id="obsidian" title="15. 다른 컴퓨터에서 이어보기">
        <p>
          저장 폴더 안의 내용은 <b>Obsidian 볼트</b> 그대로입니다 — 프로젝트 폴더를 Obsidian으로 열면 인물·집단
          노트가 서로 <Code>[[위키링크]]</Code>로 이어져 있고, 캐릭터 디자인 이미지도 그대로 보입니다.
        </p>
        <p>
          다른 컴퓨터나 브라우저에서 이어서 쓰고 싶다면, 메인 화면의 <Code>저장 폴더에서 불러오기</Code>로 그 폴더를
          다시 골라주면 됩니다. 세계관·캐릭터·집단·사실·이야기는 물론, 관계 지수·이미지 자르기 위치·목차와 시점·떡밥까지
          전부 그대로 복원됩니다(단, 휴지통에 넣어둔 삭제 항목은 애초에 저장되지 않아 복원되지 않습니다). 이름이
          같은 프로젝트가 이미 있으면 중복 생성하지 않고 건너뜁니다.
        </p>
      </Section>
    </main>
  );
}
