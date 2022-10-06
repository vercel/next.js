export const config = {
  runtime: 'experimental-edge',
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
