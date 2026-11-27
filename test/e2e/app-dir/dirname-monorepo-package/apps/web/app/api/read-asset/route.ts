import { connection } from 'next/server'
import { dirname, filename, wasmPath, wasmByteLength } from 'my-wasm-pkg'

export async function GET() {
  // Respond at request time, so that the values are computed by the server
  // that is running, not at build time.
  await connection()
  return Response.json({ dirname, filename, wasmPath, wasmByteLength })
}
