"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { loadProjects, newProject, saveProjects, type Project } from "@/lib/store";
import { importObsidianVault } from "@/lib/import";
import { saveProjectToDir } from "@/lib/export";
import { getStoredRootHandle, hasWritePermission, pickRootFolder, reconnectRootFolder } from "@/lib/rootFolder";
import type { FSDirHandle } from "@/lib/fs-types";

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
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-bold">Persona Studio</h1>
      <p className="mt-1 text-sm text-gray-500">
        상황을 던져보세요. 대사는 캐릭터가 자신의 방식으로 선택합니다.
      </p>
      <div className="mt-6 flex gap-2">
        <input
          className="flex-1 rounded border px-3 py-2"
          placeholder="새 프로젝트 이름"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
        />
        <button onClick={create} className="rounded bg-black px-4 py-2 text-white dark:bg-white dark:text-black">
          만들기
        </button>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={importFolder}
          disabled={importing}
          className="rounded border px-3 py-1.5 text-sm disabled:opacity-40"
        >
          {importing ? "불러오는 중…" : "저장 폴더에서 불러오기"}
        </button>
        <span className="text-xs text-gray-400">Obsidian 내보내기 폴더를 골라 그 안의 프로젝트들을 복원합니다.</span>
      </div>
      {importMsg && <p className="mt-1 text-xs text-gray-500">{importMsg}</p>}

      <p className="mt-1 text-xs text-gray-400">
        또는 스토리를 저장할 폴더를 선택해 주세요 — 그 폴더가 이야기의 루트 폴더가 되어, 새 프로젝트를 만들면 그 안에
        프로젝트 이름의 폴더가 자동으로 생기고 이야기가 바뀔 때마다 자동으로 저장됩니다.
      </p>
      <div className="mt-1.5 flex items-center gap-2">
        <button onClick={connectRoot} className="rounded border px-3 py-1.5 text-sm">
          {rootHandle ? "저장 폴더 변경" : "저장 폴더 선택"}
        </button>
        {rootHandle && rootPermission === "granted" && (
          <span className="text-xs text-emerald-600 dark:text-emerald-400">연결됨: {rootHandle.name}</span>
        )}
        {rootHandle && rootPermission === "lost" && (
          <span className="text-xs text-amber-600 dark:text-amber-400">
            {rootHandle.name} 연결이 끊어졌어요 —{" "}
            <button onClick={reconnectRoot} className="underline">
              다시 연결
            </button>
          </span>
        )}
      </div>
      <ul className="mt-6 space-y-2">
        {projects.map((p) => (
          <li key={p.id} className="flex items-center justify-between rounded border p-3">
            <Link href={`/p/${p.id}`} className="font-medium hover:underline">
              {p.name}
            </Link>
            <span className="text-sm text-gray-400">
              캐릭터 {p.personas.length} · 승인대기 {p.pending.length}
              <button onClick={() => remove(p.id)} className="ml-3 text-red-400 hover:text-red-600">
                삭제
              </button>
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
