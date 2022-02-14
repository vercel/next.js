import { Server } from '../../dist/server'

export default function handler(_, res) {
  res.json(Server())
}
