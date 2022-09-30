import LogtoClient from '@logto/next'

export const logtoClient = new LogtoClient({
  appId: process.env.LOGTO_APP_ID,
  appSecret: process.env.LOGTO_APP_SECRET,
  endpoint: process.env.LOGTO_ENDPOINT,
  baseUrl: process.env.BASE_URL,
  cookieSecret: process.env.COOKIE_SECRET,
  cookieSecure: process.env.NODE_ENV === 'production',
})
