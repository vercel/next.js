import { Readable } from 'stream'

export const config = {
  api: { bodyParser: false },
}

async function readBodyWithReadableToWeb(readable) {
  const reader = Readable.toWeb(readable).getReader()
  const chunks = []

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(Buffer.from(value))
  }

  return Buffer.concat(chunks)
}

export default async function handler(req, res) {
  const body = await readBodyWithReadableToWeb(req)

  res.status(200).json({
    echo: JSON.parse(body.toString()),
    writableState: Boolean(req._writableState),
    write: typeof req.write,
    end: typeof req.end,
  })
}
