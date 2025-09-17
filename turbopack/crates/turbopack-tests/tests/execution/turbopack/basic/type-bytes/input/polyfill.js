// Polyfill for Uint8Array.fromBase64

function Uint8Array_fromBase64(base64) {
  var binaryString = atob(base64)
  var bytes = new Uint8Array(binaryString.length)
  for (var i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes
}

Uint8Array.fromBase64 = Uint8Array_fromBase64
