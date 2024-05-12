import { Client } from './client'

export default function Page() {
  const binaryData = new Uint8Array([104, 101, 108, 108, 111])
  const nonUtf8BinaryData = new Uint8Array([0xff, 0, 1, 2, 3])

  return (
    <Client
      data={binaryData}
      arbitrary={nonUtf8BinaryData}
      action={async function* () {
        'use server'

        yield {
          data: binaryData,
          stream: new ReadableStream({
            type: 'bytes',
            async start(controller) {
              controller.enqueue(new Uint8Array([104, 101]))
              await new Promise((resolve) => setTimeout(resolve, 500))
              controller.enqueue(new Uint8Array([108, 108, 111]))
              await new Promise((resolve) => setTimeout(resolve, 500))
              controller.close()
            },
          }),
        }
      }}
    />
  )
}
