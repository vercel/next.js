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

export function createEncodeTransformStream(encoder = new TextEncoder()) {
  return new TransformStream<string, Uint8Array>({
    transform(chunk, controller) {
      return controller.enqueue(encoder.encode(chunk))
    },
  })
}
