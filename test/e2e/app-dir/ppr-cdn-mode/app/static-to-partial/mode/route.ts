import { setMode, type Mode } from '../mode'

export async function POST(request: Request) {
  const mode: Mode = await request.json()
  setMode(mode)
  return Response.json(mode)
}
