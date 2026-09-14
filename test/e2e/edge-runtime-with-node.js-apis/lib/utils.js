/* eslint-disable no-undef */
export function invokeNodeAPI(useCase) {
  let handle
  if (useCase === 'Buffer') {
    Buffer.from('')
  } else if (useCase === 'setImmediate') {
    handle = setImmediate(() => {})
  } else if (useCase === 'clearImmediate') {
    clearImmediate(handle)
  } else if (useCase === 'process.cwd') {
    console.log(process.cwd())
  } else if (useCase === 'process.getuid') {
    console.log(process.getuid())
  } else if (useCase === 'process.cpuUsage') {
    console.log(process.cpuUsage())
  } else if (useCase === 'BroadcastChannel') {
    new BroadcastChannel()
  } else if (useCase === 'ByteLengthQueuingStrategy') {
    new ByteLengthQueuingStrategy()
  } else if (useCase === 'CompressionStream') {
    new CompressionStream()
  } else if (useCase === 'CountQueuingStrategy') {
    new CountQueuingStrategy()
  } else if (useCase === 'DecompressionStream') {
    new DecompressionStream()
  } else if (useCase === 'DomException') {
    new DomException()
  } else if (useCase === 'MessageChannel') {
    new MessageChannel()
  } else if (useCase === 'MessageEvent') {
    new MessageEvent()
  } else if (useCase === 'MessagePort') {
    new MessagePort()
  } else if (useCase === 'ReadableByteStreamController') {
    new ReadableByteStreamController()
  } else if (useCase === 'ReadableStreamBYOBRequest') {
    new ReadableStreamBYOBRequest()
  } else if (useCase === 'ReadableStreamDefaultController') {
    new ReadableStreamDefaultController()
  } else if (useCase === 'TransformStreamDefaultController') {
    new TransformStreamDefaultController()
  } else if (useCase === 'WritableStreamDefaultController') {
    new WritableStreamDefaultController()
  } else if (useCase === 'process.version') {
    console.log(process.version)
  } else if (useCase === 'process.arch') {
    console.log(process.arch)
  }
}
