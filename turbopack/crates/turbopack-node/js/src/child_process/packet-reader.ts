type State =
  | {
      type: 'waiting'
    }
  | {
      type: 'packet'
      length: number
    }

/**
 * Decodes length-prefixed packets (a u32 big-endian byte length followed by a
 * UTF-8 JSON payload) from a stream of chunks, and hands the decoded messages
 * to `recv()` callers in order.
 */
export class PacketReader<TIncoming> {
  private state: State = { type: 'waiting' }
  // Received chunks that have not been consumed yet. We keep them as a list
  // (instead of concatenating on every chunk) so that assembling a packet that
  // arrives in many chunks copies each byte only once.
  private readonly chunks: Buffer[] = []
  private bufferedLength = 0
  // Complete packets that no `recv()` call has consumed yet.
  private readonly packetQueue: Buffer[] = []
  // `recv()` calls waiting for the next packet.
  private readonly recvPromiseResolveQueue: Array<
    (message: TIncoming) => void
  > = []

  /**
   * Feeds a chunk of received bytes into the reader. Each packet it completes
   * is decoded for the oldest waiting `recv()` call, or queued until the next
   * `recv()` call if none is waiting.
   */
  push(chunk: Buffer): void {
    this.chunks.push(chunk)
    this.bufferedLength += chunk.length

    loop: while (true) {
      switch (this.state.type) {
        case 'waiting': {
          if (this.bufferedLength >= 4) {
            const length = this.takeBytes(4).readUInt32BE(0)
            this.state = { type: 'packet', length }
          } else {
            break loop
          }
          break
        }
        case 'packet': {
          if (this.bufferedLength >= this.state.length) {
            const packet = this.takeBytes(this.state.length)
            this.state = { type: 'waiting' }
            this.pushPacket(packet)
          } else {
            break loop
          }
          break
        }
        default:
          invariant(this.state, (state) => `Unknown state type: ${state?.type}`)
      }
    }
  }

  /**
   * Resolves with the next decoded message.
   */
  async recv(): Promise<TIncoming> {
    const packet = this.packetQueue.shift()
    if (packet != null) {
      return JSON.parse(packet.toString('utf8')) as TIncoming
    }

    return new Promise<TIncoming>((resolve) => {
      this.recvPromiseResolveQueue.push(resolve)
    })
  }

  private pushPacket(packet: Buffer): void {
    const recvPromiseResolve = this.recvPromiseResolveQueue.shift()
    if (recvPromiseResolve != null) {
      recvPromiseResolve(JSON.parse(packet.toString('utf8')) as TIncoming)
    } else {
      this.packetQueue.push(packet)
    }
  }

  /**
   * Removes the first `length` bytes from `chunks` and returns them.
   * The caller must ensure that `bufferedLength >= length`.
   */
  private takeBytes(length: number): Buffer {
    if (length === 0) {
      return Buffer.alloc(0)
    }
    this.bufferedLength -= length
    const chunks = this.chunks
    const first = chunks[0]
    if (first.length === length) {
      // Fast path: the first chunk is exactly the requested bytes.
      chunks.shift()
      return first
    }
    if (first.length > length) {
      // The bytes are contained in the first chunk, no copy needed.
      chunks[0] = first.subarray(length)
      return first.subarray(0, length)
    }
    const result = Buffer.allocUnsafe(length)
    let offset = 0
    let consumed = 0
    while (offset < length) {
      const chunk = chunks[consumed]
      const remaining = length - offset
      if (chunk.length <= remaining) {
        chunk.copy(result, offset)
        offset += chunk.length
        consumed++
      } else {
        chunk.copy(result, offset, 0, remaining)
        chunks[consumed] = chunk.subarray(remaining)
        offset += remaining
      }
    }
    chunks.splice(0, consumed)
    return result
  }
}

/**
 * Utility function to ensure all variants of an enum are handled.
 */
function invariant(never: never, computeMessage: (arg: any) => string): never {
  throw new Error(`Invariant: ${computeMessage(never)}`)
}
