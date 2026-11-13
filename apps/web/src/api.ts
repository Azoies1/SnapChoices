import type {
  ApiErrorBody,
  ClassifyResponse,
  DecideResponse,
  DecisionInput,
  ExplainRequest,
  ExplainResponse,
} from "@snap/shared";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "network");
  }
  const data = (await res.json().catch(() => null)) as (T & ApiErrorBody) | null;
  if (!res.ok || data === null) {
    throw new ApiError(res.status, data?.error ?? "unknown", data?.message);
  }
  return data;
}

export const api = {
  classify: (input: DecisionInput) => post<ClassifyResponse>("/api/classify", input),
  decide: (input: DecisionInput) => post<DecideResponse>("/api/decide", input),
  explain: (request: ExplainRequest) => post<ExplainResponse>("/api/explain", request),
};
