import { once } from 'node:events'

export default async (req, res) => {
  // Exercise the same 4 MiB + 1 byte chunked response without allocating
  // millions of tiny pending writes when the client applies backpressure.
  const chunk = '.'.repeat(64 * 1024)
  for (let i = 0; i < 64; i++) {
    if (!res.write(chunk)) await once(res, 'drain')
  }
  res.end('.')
}
