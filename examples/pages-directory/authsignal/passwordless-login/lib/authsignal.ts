import { Authsignal } from '@authsignal/node'

const secret = process.env.AUTHSIGNAL_SECRET!

export const authsignal = new Authsignal({ secret })
