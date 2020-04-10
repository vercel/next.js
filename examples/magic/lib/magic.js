import { findUser } from './user'

const { Magic } = require("@magic-sdk/admin")
const magic = new Magic(process.env.MAGIC_SECRET_KEY)

const MagicStrategy = require("passport-magic").Strategy

export const strategy = new MagicStrategy(async function(user, done) {
  const userMetadata = await magic.users.getMetadataByIssuer(user.issuer)
  // In real application, if existing user doesn't exist, create new user based on email
  findUser({ email: userMetadata.email, issuer: userMetadata.issuer })
    .then(user => {
      done(null, user)
    })
    .catch(error => {
      done(error)
    })
})
