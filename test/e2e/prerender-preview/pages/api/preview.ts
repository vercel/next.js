import type { NextApiRequest, NextApiResponse } from 'next'

export default (req: NextApiRequest, res: NextApiResponse) => {
  if (req.query.tooBig) {
    try {
      res.setPreviewData(new Array(2000).fill('a').join(''))
    } catch (err: any) {
      return res.status(500).end(err.message)
    }
  } else {
    res.setPreviewData(req.query, {
      ...(req.query.cookieMaxAge
        ? { maxAge: Number(req.query.cookieMaxAge) }
        : undefined),
      ...(req.query.cookiePath
        ? { path: req.query.cookiePath as string }
        : undefined),
    })
  }

  res.status(200).end()
}
