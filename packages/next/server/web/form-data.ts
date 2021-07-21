import { isBlob } from './is'
import { streamToIterator } from './utils'

const carriage = '\r\n'
const dashes = '-'.repeat(2)
const carriageLength = 2

function getFooter(boundary: string) {
  return `${dashes}${boundary}${dashes}${carriage.repeat(2)}`
}

function getHeader(boundary: string, name: string, field: FormDataEntryValue) {
  let header = ''
  header += `${dashes}${boundary}${carriage}`
  header += `Content-Disposition: form-data; name="${name}"`

  if (isBlob(field)) {
    header += `; filename="${field.name}"${carriage}`
    header += `Content-Type: ${field.type || 'application/octet-stream'}`
  }

  return `${header}${carriage.repeat(2)}`
}

export function getBoundary() {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)

  let str = ''
  for (var i = 0; i < array.length; i++) {
    str += array[i].toString(16).padStart(2, '0')
  }

  return str
}

export async function* formDataIterator(
  form: FormData,
  boundary: string
): AsyncIterableIterator<Uint8Array> {
  const encoder = new TextEncoder()
  for (const [name, value] of form) {
    yield encoder.encode(getHeader(boundary, name, value))

    if (isBlob(value)) {
      const stream: ReadableStream<Uint8Array> = value.stream()
      yield* streamToIterator(stream)
    } else {
      yield encoder.encode(value)
    }

    yield encoder.encode(carriage)
  }

  yield encoder.encode(getFooter(boundary))
}

export function getFormDataLength(form: FormData, boundary: string) {
  let length = 0

  for (const [name, value] of form) {
    length += Buffer.byteLength(getHeader(boundary, name, value))
    length += isBlob(value) ? value.size : Buffer.byteLength(String(value))
    length += carriageLength
  }

  length += Buffer.byteLength(getFooter(boundary))
  return length
}
