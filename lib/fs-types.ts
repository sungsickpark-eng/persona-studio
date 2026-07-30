// File System Access API의 필요한 부분만 최소로 선언 — TS 표준 DOM 타입에 없어도 동작하도록.
// export.ts(쓰기)·import.ts(읽기)·rootFolder.ts(핸들 저장·권한)가 전부 같은 핸들을 주고받으므로 여기 하나로 공유한다.
export type FSPermissionState = "granted" | "denied" | "prompt";
export type FSPermissionOptions = { mode: "read" | "readwrite" };

export type FSWritable = { write(data: string | Uint8Array): Promise<void>; close(): Promise<void> };

export type FSFileHandle = {
  kind: "file";
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<FSWritable>;
};

export type FSDirHandle = {
  kind: "directory";
  name: string;
  values(): AsyncIterable<FSDirHandle | FSFileHandle>;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FSDirHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FSFileHandle>;
  queryPermission(options: FSPermissionOptions): Promise<FSPermissionState>;
  requestPermission(options: FSPermissionOptions): Promise<FSPermissionState>;
};

export function getDirectoryPicker(): (() => Promise<FSDirHandle>) | undefined {
  return (window as unknown as { showDirectoryPicker?: () => Promise<FSDirHandle> }).showDirectoryPicker;
}
