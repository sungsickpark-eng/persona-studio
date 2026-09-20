// 스토리를 저장할 폴더("저장 폴더")를 한 번 연결해두면, 그 안에 프로젝트마다 폴더가 자동으로 생기고
// 이야기가 바뀔 때마다 조용히 다시 저장된다. File System Access API 핸들은 구조적 복제가 가능해서
// IndexedDB엔 저장할 수 있지만(localStorage는 JSON만 가능해서 저장 못 함) 브라우저를 새로 열면 권한은
// 다시 확인해야 한다(브라우저 보안 정책 — 조용히 확인만 하고, 끊겼으면 사용자 클릭으로만 되살릴 수 있음).
import { getDirectoryPicker, type FSDirHandle } from "./fs-types";
import { ownerSuffix } from "./deviceOwner";

const DB_NAME = "persona-studio-fs";
const STORE = "handles";
const ROOT_KEY = "root";
// 프로젝트 목록(lib/store.ts)과 같은 규칙 — 이 기기에서 다른 계정으로 로그인하면 저장 폴더 연결도 따로 가져서,
// 그 계정 화면에 이전 계정이 연결해둔 폴더가 그대로 보이는 일이 없게 한다
const rootKey = () => ROOT_KEY + ownerSuffix();

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getStoredRootHandle(): Promise<FSDirHandle | null> {
  if (typeof indexedDB === "undefined") return null;
  const db = await openDb();
  return new Promise((resolve) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).get(rootKey());
    req.onsuccess = () => resolve((req.result as FSDirHandle | undefined) ?? null);
    req.onerror = () => resolve(null);
  });
}

async function setStoredRootHandle(handle: FSDirHandle): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(handle, rootKey());
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// 폴더 선택 창을 띄워 새로 연결하고 IndexedDB에 저장 — 사용자 클릭 안에서 호출되므로 쓰기 권한도 함께 확정됨
export async function pickRootFolder(): Promise<FSDirHandle> {
  const picker = getDirectoryPicker();
  if (!picker) throw new Error("이 브라우저는 폴더 연결을 지원하지 않습니다. Chrome 또는 Edge를 사용하세요.");
  const handle = await picker();
  await handle.requestPermission({ mode: "readwrite" });
  await setStoredRootHandle(handle);
  return handle;
}

// 저장된 핸들의 쓰기 권한이 아직 살아있는지 프롬프트 없이 조용히 확인 — 자동 저장 전에 매번 이걸로 확인
export async function hasWritePermission(handle: FSDirHandle): Promise<boolean> {
  return (await handle.queryPermission({ mode: "readwrite" })) === "granted";
}

// 끊긴 권한을 다시 확인받는다 — 브라우저가 사용자 동작(클릭) 없는 권한 요청은 막으므로 반드시 클릭 핸들러 안에서 호출
export async function reconnectRootFolder(handle: FSDirHandle): Promise<boolean> {
  return (await handle.requestPermission({ mode: "readwrite" })) === "granted";
}
