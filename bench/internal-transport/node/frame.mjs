// Node side of the framing in ../go/frame.go.

function strLen(s) {
  return 2 + Buffer.byteLength(s)
}

function writeStr(buf, off, s) {
  const n = buf.write(s, off + 2, 'latin1')
  buf.writeUInt16BE(n, off)
  return off + 2 + n
}

/** head + optional single body chunk + end marker, as one Buffer. */
export function encodeRequest(method, target, headers, payload) {
  let size = 4 + strLen(method) + strLen(target) + 2
  for (const [k, v] of headers) size += strLen(k) + strLen(v)
  const bodyLen = payload && payload.length ? 4 + payload.length : 0
  const buf = Buffer.allocUnsafe(size + bodyLen + 4)
  buf.writeUInt32BE(size - 4, 0)
  let off = writeStr(buf, 4, method)
  off = writeStr(buf, off, target)
  buf.writeUInt16BE(headers.length, off)
  off += 2
  for (const [k, v] of headers) {
    off = writeStr(buf, off, k)
    off = writeStr(buf, off, v)
  }
  if (bodyLen) {
    buf.writeUInt32BE(payload.length, off)
    payload.copy(buf, off + 4)
    off += bodyLen
  }
  buf.writeUInt32BE(0, off)
  return buf
}

export function encodeResponse(status, headers, payload) {
  let size = 4 + 2 + 2
  for (const [k, v] of headers) size += strLen(k) + strLen(v)
  const bodyLen = payload.length ? 4 + payload.length : 0
  const buf = Buffer.allocUnsafe(size + bodyLen + 4)
  buf.writeUInt32BE(size - 4, 0)
  buf.writeUInt16BE(status, 4)
  buf.writeUInt16BE(headers.length, 6)
  let off = 8
  for (const [k, v] of headers) {
    off = writeStr(buf, off, k)
    off = writeStr(buf, off, v)
  }
  if (bodyLen) {
    buf.writeUInt32BE(payload.length, off)
    payload.copy(buf, off + 4)
    off += bodyLen
  }
  buf.writeUInt32BE(0, off)
  return buf
}

function readStr(buf, off) {
  const n = buf.readUInt16BE(off)
  return [buf.latin1Slice(off + 2, off + 2 + n), off + 2 + n]
}

export function decodeRequestHead(head) {
  let [method, off] = readStr(head, 0)
  let target
  ;[target, off] = readStr(head, off)
  const n = head.readUInt16BE(off)
  off += 2
  const headers = new Array(n)
  for (let i = 0; i < n; i++) {
    let k, v
    ;[k, off] = readStr(head, off)
    ;[v, off] = readStr(head, off)
    headers[i] = [k, v]
  }
  return { method, target, headers }
}

export function decodeResponseHead(head) {
  const status = head.readUInt16BE(0)
  const n = head.readUInt16BE(2)
  let off = 4
  const headers = new Array(n)
  for (let i = 0; i < n; i++) {
    let k, v
    ;[k, off] = readStr(head, off)
    ;[v, off] = readStr(head, off)
    headers[i] = [k, v]
  }
  return { status, headers }
}

/**
 * Splits a socket's byte stream into messages: calls onHead(head) for each
 * head, onChunk(bytes) per body chunk and onEnd() at the empty chunk.
 */
export function frameReader(onHead, onChunk, onEnd) {
  let pending = null
  let inBody = false
  // Bytes still to come of the body chunk being streamed through onChunk.
  let remaining = 0
  return (data) => {
    let buf = pending ? Buffer.concat([pending, data]) : data
    pending = null
    let off = 0
    if (remaining > 0) {
      const take = Math.min(remaining, buf.length)
      onChunk(buf.subarray(0, take))
      remaining -= take
      off = take
    }
    while (buf.length - off >= 4) {
      const n = buf.readUInt32BE(off)
      if (inBody && n === 0) {
        off += 4
        inBody = false
        onEnd()
        continue
      }
      if (inBody && buf.length - off - 4 < n) {
        // Stream the part of the chunk that has arrived.
        const part = buf.subarray(off + 4)
        onChunk(part)
        remaining = n - part.length
        off = buf.length
        break
      }
      if (buf.length - off - 4 < n) break
      const slice = buf.subarray(off + 4, off + 4 + n)
      off += 4 + n
      if (inBody) onChunk(slice)
      else {
        inBody = true
        onHead(slice)
      }
    }
    if (off < buf.length) pending = buf.subarray(off)
  }
}
