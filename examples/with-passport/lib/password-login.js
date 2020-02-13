import Local from 'passport-local'
import Iron from '@hapi/iron'
import { TOKEN_SECRET } from './configs'
import { findUser } from './user'

export const localStrategy = new Local.Strategy(function(
  username,
  password,
  done
) {
  findUser({ username, password })
    .then(user => {
      return { ...user, createdAt: Date.now() }
    })
    .then(session => {
      return Iron.seal(session, TOKEN_SECRET, Iron.defaults)
    })
    .then(encryptedToken => {
      done(null, encryptedToken)
    })
    .catch(() => {
      done(null, false, { message: 'Invalid user' })
    })
})
