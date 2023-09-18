import 'server-only'
// import { sharedComponentValue } from '../../lib/mixed-lib'

export default function handler(req, res) {
  return res.send('api/hello.js:' + sharedComponentValue)
}
