import type { NextApiRequest, NextApiResponse } from 'next'

export default async function Handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const form = new URLSearchParams()
  form.append('secret', process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY)
  form.append('response', req.body['cf-turnstile-response'])
  form.append('remoteip', req.headers['x-forwarded-for'] as string)

  const result = await fetch(
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    { method: 'POST', body: form }
  )
  const json = await result.json()
  res.status(result.status).json(json)
}
