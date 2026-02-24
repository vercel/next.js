import text from './data.txt' with { type: 'text' }
import jsAsText from './some.js' with { type: 'text' }
import bytes from './data.bin' with { type: 'bytes' }
import jsAsBytes from './some.js' with { type: 'bytes' }
import configuredAsJsAsBytes from './configured-as-ecmascript.txt' with { type: 'bytes' }
import json from './data.json' with { type: 'json' }
import jsonAsText from './data.json' with { type: 'text' }

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
      configuredAsJsAsBytes: {
        instanceofUint8Array: configuredAsJsAsBytes instanceof Uint8Array,
        content: new TextDecoder().decode(configuredAsJsAsBytes),
      },
      json: {
        typeofObject: typeof json === 'object',
        content: json,
      },
      jsonAsText: {
        typeofString: typeof jsonAsText === 'string',
        content: jsonAsText,
      },
    },
    { status: 200 }
  )
}
