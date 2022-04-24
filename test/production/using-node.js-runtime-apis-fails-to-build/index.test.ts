import { nextBuild } from 'next-test-utils'
import os from 'os'
import path from 'path'
import { outputFile } from 'fs-extra'

it('fails to build Middleware with `eval`', async () => {
  const rootDir = await createStructure({
    'pages/_middleware.js': `
      export default function middleware() { 
        return new Response(eval("'hello'"))
      } 
    `,
  })

  const result = await nextBuild(rootDir, [], {
    stderr: true,
    stdout: true,
  })

  expect(result.stderr).toContain(
    `Dynamic Code Evaluation (e. g. 'eval', 'new Function') not allowed in Middleware pages/_middleware`
  )
})

it('fails to build Middleware with `process.cwd`', async () => {
  const rootDir = await createStructure({
    'pages/_middleware.js': `
      export default function middleware() { 
        return new Response(process.cwd())
      } 
    `,
  })

  const result = await nextBuild(rootDir, [], {
    stderr: true,
    stdout: true,
  })

  expect(result.stderr).toContain(
    `You're using a Node.js API (process.cwd) which is not supported in the Edge Runtime that Middleware uses (used in pages/_middleware)`
  )
})

async function createStructure(
  structure: Record<string, string>
): Promise<string> {
  const rootDir = path.join(os.tmpdir(), `next-${Date.now()}`)

  for (const [filePath, contents] of Object.entries(structure)) {
    await outputFile(path.join(rootDir, filePath), contents)
  }

  return rootDir
}
