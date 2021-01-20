import SuperTokens from 'supertokens-node'
import Session from 'supertokens-node/recipe/session'
import EmailPassword from 'supertokens-node/recipe/emailpassword'
const port = process.env.APP_PORT || 3000
const websiteDomain = process.env.APP_URL || `http://localhost:${port}`
const apiBasePath = '/api/auth/'

if (typeof window === 'undefined') {
  SuperTokens.init({
    supertokens: {
      connectionURI: 'https://try.supertokens.io', // Replace with your SuperTokens core instance. See https://supertokens.io/docs/emailpassword/quick-setup/supertokens-core/overview
    },
    appInfo: {
      appName: 'SuperTokens Demo App',
      websiteDomain,
      apiDomain: websiteDomain,
      apiBasePath,
    },
    recipeList: [EmailPassword.init(), Session.init()],
  })
}
