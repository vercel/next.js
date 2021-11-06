/**
 * The ArrayBuffer object is used to represent a generic, fixed-length raw
 * binary data buffer. It is an array of bytes, often referred to in other
 * languages as a "byte array". You cannot directly manipulate the contents of
 * an ArrayBuffer; instead, you  create one of the typed array objects or a
 * DataView object which represents the buffer in a specific format, and use
 * that to read and write the contents of the buffer.
 */
export function isArrayBuffer(value: any): value is ArrayBuffer {
  return ArrayBuffer.prototype.isPrototypeOf(value)
}

/**
 * ArrayBufferView is a helper type representing any of the following JS
 * TypedArray types which correspond to the list below. It is checked by duck
 * typing the provided object.
 */
export function isArrayBufferView(value: any): value is ArrayBufferView {
  return ArrayBuffer.isView(value)
}

/**
 * The DataView view provides a low-level interface for reading and writing
 * multiple number types in a binary ArrayBuffer, without having to care about
 * the platform's endianness.
 */
export function isDataView(value: any): value is DataView {
  return DataView.prototype.isPrototypeOf(value)
}

/**
 * The URLSearchParams interface defines utility methods to work with the
 * query string of a URL.
 */
export function isURLSearchParams(value: any): value is URLSearchParams {
  return URLSearchParams.prototype.isPrototypeOf(value)
}

/**
 * The Blob object represents a blob, which is a file-like object of immutable,
 * raw data; they can be read as text or binary data. Blobs can represent data
 * that isn't necessarily in a JavaScript-native format.
 */
export function isBlob(value: any): value is Blob {
  return Blob.prototype.isPrototypeOf(value)
}

/**
 * The FormData interface provides a way to easily construct a set of key/value
 * pairs representing form fields and their values, which can then be easily
 * sent using the XMLHttpRequest.send() method. It uses the same format a
 * form would use if the encoding type were set to "multipart/form-data".
 */
export function isFormData(value: any): value is FormData {
  return FormData.prototype.isPrototypeOf(value)
}

/**
 * The ReadableStream interface of the Streams API represents a readable stream
 * of byte data. Because we want to allow alternative implementations we also
 * duck type here.
 */
export function isReadableStream(value: any): value is ReadableStream {
  return (
    value &&
    (ReadableStream.prototype.isPrototypeOf(value) ||
      (value.constructor.name === 'ReadableStream' && 'getReader' in value))
  )
}

/**
 * Checks in an object implements an Iterable interface
 */
export function isIterable(object: any): object is Iterable<unknown> {
  return (
    object &&
    Symbol.iterator in object &&
    typeof object[Symbol.iterator] === 'function'
  )
}
