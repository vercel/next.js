'use server'

import { headers } from 'next/headers'

// Logged to the terminal so the test can assert on what the action actually
// observed. The test sends a `Host` that differs from the server's own origin,
// which a browser cannot do, so this is the only way to see the difference.
export async function reportHost() {
  const headerList = await headers()

  console.log(
    `[reportHost]` +
      JSON.stringify({
        host: headerList.get('host'),
        xForwardedHost: headerList.get('x-forwarded-host'),
        actionForwarded: headerList.get('x-action-forwarded'),
      })
  )
}
