import { Counter } from '../counter'

export function GET() {
  return Response.json({ type: typeof Counter })
}
