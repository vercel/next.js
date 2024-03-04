import type * as addWasmModule from "../../../add.wasm";
// @ts-ignore
import addWasm from "../../add.wasm?module";

const module$ = WebAssembly.instantiate(addWasm);

export async function GET() {
  const instance = (await module$) as any;
  const exports = instance.exports as typeof addWasmModule;
  const { add_one: addOne } = exports;
  const number = addOne(10);

  return new Response(`got: ${number}`);
}

export const runtime = "edge";
