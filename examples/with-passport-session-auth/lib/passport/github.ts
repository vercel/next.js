import { Strategy as GithubStrategy } from 'passport-github'
import appConfig from '../appConfig'

// STATICALLY configure the Github strategy for use by Passport.
//
// OAuth 2.0-based strategies require a `verify` function which receives the
// credential (`accessToken`) for accessing the Github API on the user's
// behalf, along with the user's profile.  The function must invoke `cb`
// with a user object, which will be exposed in the request as `req.user`
// in api handlers after authentication.
const strategy = new GithubStrategy(
  appConfig.github,
  (accessToken, refreshToken, githubProfile, cb) => {
    // Right now, the user's Github profile is supplied as the user
    // record. In a production-quality application, the Github profile should
    // be associated with an app-specific user record in app persistence,
    // which allows for account linking and authentication with other identity providers.

    // Upsert user here
    console.log(accessToken, refreshToken, githubProfile)

    // see https://github.com/jaredhanson/passport-github/blob/master/lib/strategy.js#L40
    // see https://gitlab.com/andycunn/canvass/blob/f3f03859b3de66f30d7703a4c5d2f44f7c724f67/api/app.js#L118
    // for an example
    cb(null, githubProfile)
  }
)

export default strategy
