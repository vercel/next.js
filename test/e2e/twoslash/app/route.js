import { createTwoslasher } from 'twoslash'
import ts from 'typescript'

export function GET(request) {
  try {
    const options = request.nextUrl.searchParams.has('esnext')
      ? {
          target: ts.ScriptTarget.ESNext,
          lib: ['ESNext', 'DOM', 'esnext', 'dom', 'es2020'],
        }
      : {}

    const code = `type X = Promise<number>;
'hello'.toUpperCase()`
    const twoslasher = createTwoslasher({
      compilerOptions: options,
    })
    const result = twoslasher(code)

    return Response.json(result)
  } catch (e) {
    return Response.json({ error: e })
  }
}
