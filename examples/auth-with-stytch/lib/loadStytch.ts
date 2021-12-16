import * as stytch from 'stytch'

let client: stytch.Client
const loadStytch = () => {
  if (!client) {
    client = new stytch.Client({
      project_id: process.env.NEXT_PUBLIC_STYTCH_PROJECT_ID || '',
      secret: process.env.NEXT_PUBLIC_STYTCH_SECRET || '',
      env:
        process.env.NEXT_PUBLIC_STYTCH_PROJECT_ENV === 'live'
          ? stytch.envs.live
          : stytch.envs.test,
    })
  }

  return client
}

export default loadStytch
