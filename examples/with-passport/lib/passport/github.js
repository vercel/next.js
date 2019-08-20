import GitHub from 'passport-github'
import { ROOT_URL } from '../configs'
import { createJwt } from './jwt'

export const callbackURL = `${ROOT_URL}/api/login/github/callback`

export const githubStrategy = new GitHub.Strategy(
  {
    passReqToCallback: true,
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL
  },
  (_req, _accessToken, _refreshToken, profile, done) => {
    const accessToken = createJwt(profile)
    done(null, { accessToken })
  }
)
