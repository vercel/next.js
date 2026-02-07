import bytes from './data.bin' with { type: 'bytes' }

export async function GET(_req) {
  return Response.json(
    {
      instanceofUint8Array: bytes instanceof Uint8Array,
      length: bytes.length,
      content: new TextDecoder().decode(bytes),
    },
    { status: 200 }
  )
}
