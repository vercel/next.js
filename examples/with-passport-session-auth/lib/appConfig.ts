import { StrategyOptions } from 'passport-github'

export interface AppConfig {
  isDevelopment: boolean
  hostingURL: string
  github: StrategyOptions
}

const getOAuthUrls: (
  hostName: string,
  app: string
) => { callbackURL: string } = (hostName: string, app: string) => ({
  // Alternatively, use `[app].ts` filenames for paramaterized urls
  callbackURL: `${hostName}/api/auth/callback/${app}`,
})

const isDevelopment = process.env.NODE_ENV !== 'production'
const hostingURL = process.env.HOSTING_URL || 'http://localhost:3000'

const appConfig: AppConfig = {
  isDevelopment,
  hostingURL,
  github: {
    passReqToCallback: false,
    clientID: process.env.GITHUB_CLIENTID as string,
    clientSecret: process.env.GITHUB_CLIENTSECRET as string,
    ...getOAuthUrls(hostingURL, 'github'),
    scope: 'user:email',
  },
}

export default appConfig
