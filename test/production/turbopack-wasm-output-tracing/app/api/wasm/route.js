import { addOne } from 'wasm-dep'

export async function GET() {
  return Response.json({ result: await addOne(1) })
}
