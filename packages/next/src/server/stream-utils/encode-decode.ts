export function createDecodeTransformStream(decoder = new TextDecoder()) {
  return new TransformStream<Uint8Array, string>({
    transform(chunk, controller) {
      return controller.enqueue(decoder.decode(chunk, { stream: true }))
    },
    flush(controller) {
      return controller.enqueue(decoder.decode())
    },
  })
}
