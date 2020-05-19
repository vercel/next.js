const dotEnvResult = require('dotenv').config()

const prod = process.env.NODE_ENV === 'production'

if (dotEnvResult.error) {
  throw dotEnvResult.error
}

module.exports = {
  env: {
    TEST: process.env.TEST,
    BACKEND_URL: prod ? 'https://api.example.com' : 'https://localhost:8080',
  },
}

/*
  If you want to include every variable in .env automatically,
  replace the above module.exports with the code below.

  Warning: The below technique can be dangerous since it exposes every
  variable in .env to the client. Even if you do not currently have
  sensitive information there, it can be easy to forget about this when
  you add variables in the future.

  If you have many variables and want a safer way to conveniently expose
  them, see the example "with-dotenv".
*/

/*
const parsedVariables = dotEnvResult.parsed || {}
const dotEnvVariables = {}

// We always want to use the values from process.env, since dotenv
// has already resolved these correctly in case of overrides
for (const key of Object.keys(parsedVariables)) {
  dotEnvVariables[key] = process.env[key]
}

module.exports = {
  env: {
    ...dotEnvVariables,
    BACKEND_URL: prod ? 'https://api.example.com' : 'https://localhost:8080'
  }
}
*/
