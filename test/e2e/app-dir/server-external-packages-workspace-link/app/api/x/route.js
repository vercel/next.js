import { add, moduleUrl, wasmPath } from 'my-wasm-pkg/node'

export async function GET() {
  return Response.json({ sum: add(1, 2), moduleUrl, wasmPath })
}
