"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { loadProjects, newProject, saveProjects, type Project } from "@/lib/store";

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState("");

  useEffect(() => setProjects(loadProjects()), []);

  const create = () => {
    if (!name.trim()) return;
    const next = [...projects, newProject(name.trim())];
    saveProjects(next);
    setProjects(next);
    setName("");
  };

  const remove = (id: string) => {
    if (!confirm("이 프로젝트를 삭제할까요?")) return;
    const next = projects.filter((p) => p.id !== id);
    saveProjects(next);
    setProjects(next);
  };

  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-bold">Persona Story Studio</h1>
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
