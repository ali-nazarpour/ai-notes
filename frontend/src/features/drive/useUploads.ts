/**
 * Upload queue for the drive: files (and whole dropped folders) upload two at a time, with
 * progress per file, cancel, and errors kept in the list (shown in the uploads panel).
 */
import { useCallback, useRef, useState } from "react";

import { driveUpload } from "../../api/v5";
import type { DriveItem, DriveSection } from "../../types5";

export interface UploadJob {
  id: number;
  name: string;
  size: number;
  progress: number;
  status: "queued" | "uploading" | "done" | "error" | "cancelled";
  error?: unknown;
  item?: DriveItem;
}

interface Pending {
  job: UploadJob;
  file: File;
  parentId: number | null;
  path: string;
  section: DriveSection;
  controller: AbortController;
}

let nextId = 1;
const PARALLEL = 2;

/** Files of a drop, with folder paths, read through the File System Entry API. */
export async function filesFromDrop(data: DataTransfer): Promise<{ file: File; path: string }[]> {
  const entries = Array.from(data.items)
    .map((item) => (item.kind === "file" ? item.webkitGetAsEntry?.() : null))
    .filter((entry): entry is FileSystemEntry => !!entry);
  if (!entries.length) return Array.from(data.files).map((file) => ({ file, path: "" }));
  const result: { file: File; path: string }[] = [];

  async function walk(entry: FileSystemEntry, prefix: string): Promise<void> {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) =>
        (entry as FileSystemFileEntry).file(resolve, reject),
      );
      result.push({ file, path: prefix ? `${prefix}/${file.name}` : "" });
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      const folder = prefix ? `${prefix}/${entry.name}` : entry.name;
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
          reader.readEntries(resolve, reject),
        );
        if (!batch.length) break;
        for (const child of batch) await walk(child, folder);
      }
    }
  }

  for (const entry of entries) await walk(entry, "");
  return result;
}

export function useUploads(onUploaded: (item: DriveItem) => void) {
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const queue = useRef<Pending[]>([]);
  const running = useRef(0);
  const controllers = useRef(new Map<number, AbortController>());
  const onUploadedRef = useRef(onUploaded);
  onUploadedRef.current = onUploaded;

  const patch = useCallback((id: number, changes: Partial<UploadJob>) => {
    setJobs((list) => list.map((job) => (job.id === id ? { ...job, ...changes } : job)));
  }, []);

  const pump = useCallback(() => {
    while (running.current < PARALLEL && queue.current.length) {
      const next = queue.current.shift()!;
      if (next.controller.signal.aborted) continue;
      running.current += 1;
      patch(next.job.id, { status: "uploading" });
      driveUpload(
        next.file,
        next.parentId,
        next.path,
        (p) => patch(next.job.id, { progress: p }),
        next.controller.signal,
        next.section,
      )
        .then((item) => {
          patch(next.job.id, { status: "done", progress: 1, item });
          onUploadedRef.current(item);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") {
            patch(next.job.id, { status: "cancelled" });
          } else {
            patch(next.job.id, { status: "error", error });
          }
        })
        .finally(() => {
          running.current -= 1;
          pump();
        });
    }
  }, [patch]);

  const add = useCallback(
    (files: { file: File; path: string }[], parentId: number | null, section: DriveSection = "files") => {
      const pending = files.map(({ file, path }) => ({
        job: {
          id: nextId++,
          name: path || file.name,
          size: file.size,
          progress: 0,
          status: "queued" as const,
        },
        file,
        parentId,
        path,
        section,
        controller: new AbortController(),
      }));
      queue.current.push(...pending);
      setJobs((list) => [...list, ...pending.map((p) => p.job)]);
      pump();
      // Keep the controllers reachable for cancel().
      pending.forEach((p) => controllers.current.set(p.job.id, p.controller));
    },
    [pump],
  );

  const cancel = useCallback(
    (id: number) => {
      controllers.current.get(id)?.abort();
      queue.current = queue.current.filter((p) => p.job.id !== id);
      patch(id, { status: "cancelled" });
    },
    [patch],
  );

  const clear = useCallback(() => {
    setJobs((list) => list.filter((job) => job.status === "queued" || job.status === "uploading"));
  }, []);

  return { jobs, add, cancel, clear };
}
