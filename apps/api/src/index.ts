// letsdecide's package exports leave its .wasm out, so it is imported by path;
// wrangler compiles it to a WebAssembly.Module. TypeScript resolves the real
// file and finds no types for it, hence the directive.
// @ts-expect-error -- no type declarations for a .wasm file
import wasm from "../node_modules/letsdecide/pkg/letsdecide_wasm_bg.wasm";
import { createApp } from "./app";
import { setLetsDecideWasm } from "./providers";

setLetsDecideWasm(wasm as WebAssembly.Module);

export default createApp();
