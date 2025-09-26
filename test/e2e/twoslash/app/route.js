import { createTwoslasher } from 'twoslash'

const code = `'hello'.toUpperCase()`
const twoslasher = createTwoslasher()

export function GET() {
  const result = twoslasher(code)

  return Response.json(result)
}
