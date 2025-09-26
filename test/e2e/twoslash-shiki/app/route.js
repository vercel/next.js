import { transformerTwoslash } from '@shikijs/twoslash'
import { codeToHtml } from 'shiki'
import ts from 'typescript'

export async function GET() {
  const data = `
type X = Promise<number>
`

  const html = await codeToHtml(data, {
    lang: 'ts',
    theme: 'vitesse-dark',
    transformers: [
      transformerTwoslash({
        twoslashOptions: {
          compilerOptions: {
            target: ts.ScriptTarget.ESNext,
            lib: ['ESNext', 'DOM', 'esnext', 'dom', 'es2020'],
          },
        },
      }),
    ],
  })

  return Response.json(String(html))
}
