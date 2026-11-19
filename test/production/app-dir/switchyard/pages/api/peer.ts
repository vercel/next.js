import type { NextApiRequest, NextApiResponse } from 'next'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const remoteAddress = req.socket.remoteAddress
  const local = ['127.0.0.1', '::ffff:127.0.0.1', '::1'].includes(
    remoteAddress || ''
  )
  const allowed =
    req.query.policy === 'loopback'
      ? local
      : req.query.policy === 'forwarded'
        ? local && req.headers['x-forwarded-for'] === '127.0.0.1'
        : true
  const internalHeader = 'x-nextjs-switchyard-connection'
  res.status(allowed ? 200 : 403).json({
    remoteAddress,
    remotePort: req.socket.remotePort,
    remoteFamily: req.socket.remoteFamily,
    connectionAddress: req.connection.remoteAddress,
    responseAddress: res.socket?.remoteAddress,
    internalHeaderPresent:
      internalHeader in req.headers ||
      req.rawHeaders.some(
        (name, i) => i % 2 === 0 && name.toLowerCase() === internalHeader
      ),
  })
}
