/**
 * The letsdecide WebAssembly core. Its default loader fetches the `.wasm` from
 * a file URL, which neither workerd nor Node can do, so the host hands it in:
 * the Worker entry imports it as a compiled module (src/index.ts), and Node
 * code (tests, the eval script) reads the bytes with `loadNodeWasm`.
 */
let wasm: WebAssembly.Module | BufferSource | undefined;

export function setLetsDecideWasm(module: WebAssembly.Module | BufferSource): void {
  wasm = module;
}

export function letsDecideWasm(): WebAssembly.Module | BufferSource | undefined {
  return wasm;
}
