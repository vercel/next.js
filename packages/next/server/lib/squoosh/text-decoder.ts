const textDecoder =
  typeof TextDecoder !== 'undefined' ? TextDecoder : require('util').TextDecoder

export { textDecoder as TextDecoder }
