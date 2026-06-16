export const runtime = 'edge'

export async function GET() {
  const result = await new Promise<string>((resolve) => {
    setTimeout(function (this: typeof globalThis) {
      try {
        // The `this` available here should be the edge sandbox global object,
        // not the one from node. If we get the node one, we can access require
        // and thus modules that are not allowed in the edge runtime, like 'fs'.
        const outerGlobalThis = this
        const fs = outerGlobalThis.process.mainModule!.require(
          'fs'
        ) as typeof import('fs')

        fs.writeFileSync('hello.txt', 'sandbox? what sandbox?')
        resolve('escape successful')
      } catch (error) {
        resolve('escape failed:\n' + (error as Error).toString())
      }
    })
  })

  return new Response(result)
}
