import { NextResponse } from 'next/server'
import fs from 'fs'
import vm from 'vm'

declare const __turbopack_chunks__: (
  path: string,
  options?: { with: { 'turbopack-transition': string } }
) => string[]

export async function GET() {
  const chunkPaths = __turbopack_chunks__('./a.js')

  const chunkContents = chunkPaths.map((chunk) =>
    fs.readFileSync(chunk, 'utf-8')
  )

  const context = {
    MY_RESULT: undefined,
    URL: class URL {},
    Math: { random: () => 0.1234 },
  }
  vm.createContext(context)

  for (const content of chunkContents) {
    vm.runInContext(content, context)
  }

  console.log(context.MY_RESULT)

  return NextResponse.json(context.MY_RESULT)
}
