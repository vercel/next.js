export const config = {
  runtime: 'edge',
}

export default function () {
  return new Response(
    new ReadableStream({
      start(ctr) {
        ctr.enqueue(new TextEncoder().encode('hello'))
        ctr.enqueue(true)
        ctr.close()
      },
    })
  )
}
