import type { NextApiRequest, NextApiResponse } from 'next'
import Module from 'node:module'
// The dependencies of a Pages Router route are not bundled, so this package
// loads `next/server` as a file.
import { userAgent } from 'external-next-server'

function isParserLoaded() {
  return Object.keys(
    (Module as unknown as { _cache: Record<string, unknown> })._cache
  ).some((id) =>
    id.replace(/\\/g, '/').includes('/next/dist/compiled/ua-parser-js/')
  )
}

// Responds with the parsed user agent, and with whether the server process had
// loaded the parser before and after the call that needs it.
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const parserLoadedBefore = isParserLoaded()
  const parsed = userAgent({
    headers: new Headers({ 'user-agent': req.headers['user-agent'] ?? '' }),
  })

  res.status(200).json({
    parserLoadedBefore,
    parserLoadedAfter: isParserLoaded(),
    userAgent: parsed,
  })
}
