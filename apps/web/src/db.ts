import type { Decision } from "@snap/shared";

const DB_NAME = "snap";
const STORE = "decisions";

export const REGRET_AFTER_MS = 20 * 60 * 60 * 1000;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = work(tx.objectStore(STORE));
    tx.oncomplete = () => {
      db.close();
      resolve(request.result);
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      reject(tx.error);
    };
  });
}

// Writes go through one queue so an update can never land before the save it follows.
let queue: Promise<unknown> = Promise.resolve();
function enqueue<T>(work: () => Promise<T>): Promise<T> {
  const next = queue.then(work, work);
  queue = next.catch(() => undefined);
  return next;
}

export function saveDecision(decision: Decision): Promise<void> {
  // Privacy rule: a decision flagged as crisis is never written to history.
  if (decision.crisis) return Promise.resolve();
  return enqueue(async () => {
    await run("readwrite", (store) => store.put(decision));
  });
}

export function updateDecision(id: string, change: Partial<Decision>): Promise<void> {
  return enqueue(async () => {
    const current = await run<Decision | undefined>("readonly", (store) => store.get(id));
    if (!current) return;
    const next: Decision = {
      ...current,
      ...change,
      timings: { ...current.timings, ...change.timings },
    };
    await run("readwrite", (store) => store.put(next));
  });
}

export async function listDecisions(): Promise<Decision[]> {
  const all = await run<Decision[]>("readonly", (store) => store.getAll());
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export function deleteAllDecisions(): Promise<void> {
  return enqueue(async () => {
    await run("readwrite", (store) => store.clear());
  });
}

/** The most recent resolved decision that is over 20 hours old and has no regret answer. */
export async function findRegretCandidate(now: number): Promise<Decision | null> {
  const all = await listDecisions();
  const due = all
    .filter((d) => d.finalChoice && d.resolvedAt && !d.regret && now - d.resolvedAt > REGRET_AFTER_MS)
    .sort((a, b) => (b.resolvedAt ?? 0) - (a.resolvedAt ?? 0));
  return due[0] ?? null;
}
