import type { Env } from "./env";

/** Timeout and debug settings shared by every System One provider. */
export function commonOptions(env: Env): { timeoutMs?: number; onError?: (error: unknown) => void } {
  const timeoutMs = Number(env.PROVIDER_TIMEOUT_MS);
  return {
    ...(Number.isFinite(timeoutMs) && timeoutMs >= 1000 ? { timeoutMs } : {}),
    ...(env.DEBUG_PROVIDER_ERRORS === "1"
      ? {
          onError: (error: unknown) => {
            const e = error as { name?: string; code?: string; message?: string };
            console.error(`provider error: ${e.name ?? "Error"} ${e.code ?? ""} ${e.message ?? ""}`.trim());
          },
        }
      : {}),
  };
}
