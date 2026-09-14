export const config = {
  api: { bodyParser: false },
}

async function readBodyWithEvents(readable) {
  const chunks = []
  await new Promise((resolve, reject) => {
    readable.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    readable.on('end', resolve)
    readable.on('error', reject)
  })
  return Buffer.concat(chunks)
}

export default async function handler(req, res) {
  const body = await readBodyWithEvents(req)

  res.status(200).json({
    echo: JSON.parse(body.toString()),
  })
}
