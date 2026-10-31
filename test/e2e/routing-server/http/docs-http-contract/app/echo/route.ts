export async function POST(request: Request) {
  const type = request.headers.get('content-type') || ''
  if (type.startsWith('multipart/form-data')) {
    const form = await request.formData()
    const file = form.get('file') as File
    return Response.json({
      values: form.getAll('value'),
      file: {
        name: file.name,
        type: file.type,
        bytes: Array.from(new Uint8Array(await file.arrayBuffer())),
      },
    })
  }
  const bytes = new Uint8Array(await request.arrayBuffer())
  return new Response(bytes, {
    status: 201,
    headers: {
      'content-type': type || 'application/octet-stream',
      'x-received-bytes': String(bytes.byteLength),
    },
  })
}
