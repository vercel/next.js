const {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD
} = require('next/constants')

module.exports = phase => {
  const isDev = phase === PHASE_DEVELOPMENT_SERVER
  const isProd = phase === PHASE_PRODUCTION_BUILD
  const isStaging = process.env.STAGING === '1'

  const env = {
    RESTURL_SPEAKERS: (() => {
      if (isDev) return 'http://localhost:4000/speakers'
      if (isProd) { return 'https://www.siliconvalley-codecamp.com/rest/speakers/ps' }
      if (isStaging) return 'http://localhost:11639'
      return 'RESTURL_SPEAKERS:not isDev,isProd,isStaging'
    })(),
    RESTURL_SESSIONS: (() => {
      if (isDev) return 'http://localhost:4000/sessions'
      if (isProd) return 'https://www.siliconvalley-codecamp.com/rest/sessions'
      if (isStaging) return 'http://localhost:11639'
      return 'RESTURL_SESSIONS:not isDev,isProd,isStaging'
    })()
  }
  return env
}
