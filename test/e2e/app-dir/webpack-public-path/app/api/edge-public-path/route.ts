import { publicPath } from '../../shared'

export const runtime = 'edge'

export function GET() {
  return Response.json({ publicPath: publicPath() })
}
