/// <reference types="node" />
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { setLetsDecideWasm } from "./wasm";

/** Node only (Vitest, the eval script). Never imported by the Worker. */
export function loadNodeWasm(): void {
  const entry = createRequire(import.meta.url).resolve("letsdecide");
  setLetsDecideWasm(readFileSync(join(dirname(entry), "pkg", "letsdecide_wasm_bg.wasm")));
}
