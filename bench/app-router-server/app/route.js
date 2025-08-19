import * as sharp from 'sharp'

console.log(sharp)

export async function GET() {
  return Response.json({ message: 'Hello World' })
}
