import text from './data.txt' with { type: 'text' }
import jsAsText from './some.js' with { type: 'text' }
import bytes from './data.bin' with { type: 'bytes' }
import jsAsBytes from './some.js' with { type: 'bytes' }

export async function GET(_req) {
  return Response.json(
    {
      text: {
        typeofString: typeof text === 'string',
        length: text.length,
        content: text,
      },
      jsAsText: {
        typeofString: typeof jsAsText === 'string',
        content: jsAsText,
      },
      bytes: {
        instanceofUint8Array: bytes instanceof Uint8Array,
        length: bytes.length,
        content: new TextDecoder().decode(bytes),
      },
      jsAsBytes: {
        instanceofUint8Array: jsAsBytes instanceof Uint8Array,
        content: new TextDecoder().decode(jsAsBytes),
      },
    },
    { status: 200 }
  )
}
