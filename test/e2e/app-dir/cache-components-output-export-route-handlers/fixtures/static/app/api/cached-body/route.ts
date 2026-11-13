import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

async function getMessage() {
  'use cache'
  return (await readFile(join(process.cwd(), 'data.txt'), 'utf8')).trim()
}

export function GET() {
  return new Response(
    new ReadableStream({
      async start(controller) {
        controller.enqueue(new TextEncoder().encode(await getMessage()))
        controller.close()
      },
    })
  )
}
