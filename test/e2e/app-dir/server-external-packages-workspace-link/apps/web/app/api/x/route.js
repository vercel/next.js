import { add, answer, moduleUrl, wasmPath } from 'my-wasm-pkg'
import { format, dualUrl } from 'my-dual-pkg'

export async function GET() {
  return Response.json({
    sum: add(1, 2),
    answer,
    moduleUrl,
    wasmPath,
    format,
    dualUrl,
  })
}
