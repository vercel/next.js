import { add, answer, moduleUrl, wasmPath } from 'my-wasm-pkg'

export async function GET() {
  return Response.json({ sum: add(1, 2), answer, moduleUrl, wasmPath })
}
