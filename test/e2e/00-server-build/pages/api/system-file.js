import fs from 'fs'

if (process.env.NEVER_SET) {
  fs.statSync('/bin/sh')
}

export default function handle(req, res) {
  return res.status(200).json({ hello: 'world' })
}
