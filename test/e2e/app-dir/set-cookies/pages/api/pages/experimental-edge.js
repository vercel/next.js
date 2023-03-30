export const config = { runtime: 'experimental-edge' }

import cookies from '../../../cookies'

export default async function handler() {
  const headers = new Headers()
  for (const cookie of cookies) {
    headers.append('set-cookie', cookie)
  }

  return new Response(null, { headers })
}
