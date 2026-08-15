"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { loadProjects, newProject, saveProjects, type Project } from "@/lib/store";
import { importObsidianVault } from "@/lib/import";
import { saveProjectToDir } from "@/lib/export";
import { getStoredRootHandle, hasWritePermission, pickRootFolder, reconnectRootFolder } from "@/lib/rootFolder";
import type { FSDirHandle } from "@/lib/fs-types";
import ThemeToggle from "@/components/ThemeToggle";

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState("");
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");

  // 연결된 저장 폴더 — 있으면 새 프로젝트를 만들 때 그 안에 폴더가 자동 생기고, 이야기가 바뀔 때마다 자동 저장됨
  const [rootHandle, setRootHandle] = useState<FSDirHandle | null>(null);
  const [rootPermission, setRootPermission] = useState<"granted" | "lost" | "unknown">("unknown");

  useEffect(() => setProjects(loadProjects()), []);
  useEffect(() => {
    getStoredRootHandle().then(async (h) => {
      if (!h) return;
      setRootHandle(h);
      setRootPermission((await hasWritePermission(h)) ? "granted" : "lost");
    });
  }, []);

  const connectRoot = async () => {
    try {
      const h = await pickRootFolder();
      setRootHandle(h);
      setRootPermission("granted");
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return; // 폴더 선택 취소
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  const reconnectRoot = async () => {
    if (!rootHandle) return;
    setRootPermission((await reconnectRootFolder(rootHandle)) ? "granted" : "lost");
  };

  const create = () => {
    if (!name.trim()) return;
    const created = newProject(name.trim());
    const next = [...projects, created];
    saveProjects(next);
    setProjects(next);
    setName("");
    if (rootHandle && rootPermission === "granted") saveProjectToDir(rootHandle, created).catch(() => {});
  };

  const importFolder = async () => {
    setImporting(true);
    setImportMsg("");
    try {
      const found = await importObsidianVault();
      const existingNames = new Set(projects.map((p) => p.name));
      const added = found.filter((p) => !existingNames.has(p.name));
      if (added.length) {
        const next = [...projects, ...added];
        saveProjects(next);
        setProjects(next);
      }
      const skipped = found.length - added.length;
      setImportMsg(
        found.length === 0
          ? "이 폴더 아래에서 내보내기 폴더를 찾지 못했습니다."
          : `${added.length}개 프로젝트를 불러왔습니다.${skipped ? ` (이름이 같은 ${skipped}개는 건너뜀)` : ""}`,
      );
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return; // 폴더 선택 취소
      setImportMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
    }
  };

  const remove = (id: string) => {
    if (!confirm("이 프로젝트를 삭제할까요?")) return;
    const next = projects.filter((p) => p.id !== id);
    saveProjects(next);
    setProjects(next);
  };

  return (
    <main className="mx-auto max-w-3xl px-6 py-12 sm:px-8 sm:py-16">
      <style>{PROJECT_CARD_CSS}</style>

      <header className="mb-10 flex items-start justify-between gap-3">
        <div>
          <p className="studio-eyebrow">세계관 · 인물 · 이야기</p>
          <h1 className="studio-serif text-3xl font-bold sm:text-4xl">
            Persona<span className="text-fuchsia-500">·</span>Studio
          </h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            상황을 던져보세요. 대사는 캐릭터가 자신의 방식으로 선택합니다.{" "}
            <Link href="/guide" className="text-fuchsia-600 hover:underline dark:text-fuchsia-400">
              사용법 보기 →
            </Link>
          </p>
        </div>
        <ThemeToggle className="shrink-0 rounded-full border border-gray-200 px-2.5 py-1.5 text-sm transition hover:border-fuchsia-400 dark:border-gray-800" />
      </header>

      <div className="studio-panel">
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-md border border-gray-200 bg-transparent px-3 py-2.5 text-sm outline-none focus:border-fuchsia-400 dark:border-gray-800"
            placeholder="새 프로젝트 이름"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
          />
          <button
            onClick={create}
            className="shrink-0 rounded-md bg-fuchsia-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-fuchsia-500"
          >
            만들기
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-dashed border-gray-200 pt-4 text-xs dark:border-gray-800">
          <button
            onClick={importFolder}
            disabled={importing}
            className="rounded border border-gray-200 px-2.5 py-1 text-gray-600 hover:bg-gray-50 disabled:opacity-40 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-900"
          >
            {importing ? "불러오는 중…" : "저장 폴더에서 불러오기"}
          </button>
          <button
            onClick={connectRoot}
            className="rounded border border-gray-200 px-2.5 py-1 text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-900"
          >
            {rootHandle ? "저장 폴더 변경" : "저장 폴더 선택"}
          </button>
          {rootHandle && rootPermission === "granted" && (
            <span className="text-emerald-600 dark:text-emerald-400">연결됨: {rootHandle.name}</span>
          )}
          {rootHandle && rootPermission === "lost" && (
            <span className="text-amber-600 dark:text-amber-400">
              {rootHandle.name} 연결이 끊어졌어요 —{" "}
              <button onClick={reconnectRoot} className="underline">
                다시 연결
              </button>
            </span>
          )}
        </div>
        {importMsg && <p className="mt-2 text-xs text-gray-500">{importMsg}</p>}
        <p className="mt-2 text-xs text-gray-400">
          저장 폴더를 연결하면 새 프로젝트가 그 안에 자동으로 생기고, 이야기가 바뀔 때마다 자동 저장됩니다.
        </p>
      </div>

      {projects.length === 0 ? (
        <div className="studio-empty mt-8">
          <p className="text-sm text-gray-500 dark:text-gray-400">아직 만든 프로젝트가 없습니다.</p>
          <p className="mt-1 text-xs text-gray-400">위에서 이름을 입력하고 시작해보세요.</p>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {projects.map((p, i) => (
            <div
              key={p.id}
              onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                e.currentTarget.style.setProperty("--mx", `${((e.clientX - rect.left) / rect.width) * 100}%`);
                e.currentTarget.style.setProperty("--my", `${((e.clientY - rect.top) / rect.height) * 100}%`);
              }}
              className="project-card relative rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="studio-mono text-[10px] text-fuchsia-500/70">NO. {String(i + 1).padStart(3, "0")}</span>
                  <h2 className="studio-serif text-lg font-bold">{p.name}</h2>
                </div>
                <button onClick={() => remove(p.id)} className="relative z-10 shrink-0 text-xs text-red-400 hover:text-red-600">
                  삭제
                </button>
              </div>
              <p className="mt-2.5 text-xs text-gray-400">
                캐릭터 {p.personas.length} · 승인대기 {p.pending.length}
              </p>
              <Link href={`/p/${p.id}`} className="absolute inset-0" aria-label={`${p.name} 열기`} />
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

const PROJECT_CARD_CSS = `
  .studio-serif { font-family: "Nanum Myeongjo", "Apple Myungjo", Georgia, "Noto Serif KR", serif; letter-spacing: -0.01em; }
  .studio-mono { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; letter-spacing: 0.06em; }
  .studio-eyebrow {
    display: inline-flex; align-items: center; gap: 8px;
    font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.16em;
    color: #d946ef; margin-bottom: 10px;
  }
  .studio-eyebrow::before { content: ""; width: 16px; height: 1px; background: currentColor; opacity: 0.6; }
  .studio-panel {
    border: 1px solid rgba(120, 113, 130, 0.18);
    border-radius: 12px;
    padding: 20px;
    background: color-mix(in srgb, currentColor 3%, transparent);
  }
  .studio-empty {
    border: 1px dashed rgba(120, 113, 130, 0.28);
    border-radius: 12px;
    padding: 32px;
    text-align: center;
  }
  .project-card {
    overflow: hidden;
    transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
  }
  .project-card:hover {
    transform: translateY(-2px);
    border-color: rgba(217, 70, 239, 0.4);
    box-shadow: 0 8px 24px -12px rgba(217, 70, 239, 0.35);
  }
  .project-card::before {
    content: "";
    position: absolute;
    inset: 0;
    opacity: 0;
    transition: opacity 0.25s ease;
    background: radial-gradient(240px circle at var(--mx, 50%) var(--my, 50%), rgba(217, 70, 239, 0.16), transparent 60%);
    pointer-events: none;
  }
  .project-card:hover::before { opacity: 1; }
  @media (prefers-reduced-motion: reduce) {
    .project-card { transition: none; }
    .project-card::before { transition: none; }
    .project-card:hover { transform: none; }
  }
`;
