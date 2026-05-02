import { RuleTester } from 'eslint'
import { rules } from '@next/eslint-plugin-next'

const NextESLintRule = rules['no-credential-shape-in-config-env']

const err = (key, shape, masked) => ({
  messageId: 'credentialShape',
  data: { key, shape, masked },
})

const NEXT_CONFIG = '/repo/next.config.js'
const NEXT_CONFIG_TS = '/repo/next.config.ts'
const NOT_CONFIG = '/repo/pages/index.js'

const stripeSk = 'sk_live_51' + 'A'.repeat(40)
const stripePk = 'pk_live_' + 'A'.repeat(40)
const ghPat = 'ghp_' + 'a'.repeat(36)
const awsKey = 'AKIA' + 'A'.repeat(16)
const anthropicKey = 'sk-ant-api03-' + 'A'.repeat(50)
const firebaseKey = 'AIzaSy' + 'A'.repeat(33)

function fakeJwt(payload) {
  const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const p = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${h}.${p}.${'a'.repeat(43)}`
}
const supabaseServiceRole = fakeJwt({ iss: 'supabase', role: 'service_role' })
const supabaseAnon = fakeJwt({ iss: 'supabase', role: 'anon' })

const tests = {
  valid: [
    // Public-by-design values: never warn
    { filename: NEXT_CONFIG, code: `module.exports = { env: { K: ${JSON.stringify(stripePk)} } }` },
    { filename: NEXT_CONFIG, code: `module.exports = { env: { K: ${JSON.stringify(firebaseKey)} } }` },
    { filename: NEXT_CONFIG, code: `module.exports = { env: { K: ${JSON.stringify(supabaseAnon)} } }` },
    // Sentinel values
    { filename: NEXT_CONFIG, code: `module.exports = { env: { F: 'true', M: 'production' } }` },
    // Dynamic value, not a Literal
    { filename: NEXT_CONFIG, code: `module.exports = { env: { K: process.env.K } }` },
    // Same shape but in a non-config file
    { filename: NOT_CONFIG, code: `const c = { env: { K: ${JSON.stringify(stripeSk)} } }` },
    // Same shape but under a non-`env` property
    { filename: NEXT_CONFIG, code: `module.exports = { publicRuntimeConfig: { K: ${JSON.stringify(stripeSk)} } }` },
    // ESM default export form
    { filename: NEXT_CONFIG, code: `export default { env: { K: ${JSON.stringify(stripePk)} } }` },
    // .ts config file
    { filename: NEXT_CONFIG_TS, code: `export default { env: { K: ${JSON.stringify(stripePk)} } }` },
    // Computed `env` wrapper key: skip (we cannot statically resolve the key name)
    { filename: NEXT_CONFIG, code: `const E = 'env'; module.exports = { [E]: { K: ${JSON.stringify(stripeSk)} } }` },
    // Shorthand and method properties under `env`
    { filename: NEXT_CONFIG, code: `const K = 'x'; module.exports = { env: { K } }` },
    { filename: NEXT_CONFIG, code: `module.exports = { env: { K() { return 'sk_live_xxx' } } }` },
  ],
  invalid: [
    {
      filename: NEXT_CONFIG,
      code: `module.exports = { env: { STRIPE: ${JSON.stringify(stripeSk)} } }`,
      errors: [err('STRIPE', 'Stripe live secret key', 'sk_live_***')],
    },
    {
      filename: NEXT_CONFIG,
      code: `export default { env: { GH: ${JSON.stringify(ghPat)} } }`,
      errors: [err('GH', 'GitHub personal access token', 'ghp_aaaa***')],
    },
    {
      filename: NEXT_CONFIG,
      code: `module.exports = { env: { AWS: ${JSON.stringify(awsKey)} } }`,
      errors: [err('AWS', 'AWS access key ID', 'AKIAAAAA***')],
    },
    {
      filename: NEXT_CONFIG,
      code: `module.exports = { env: { ANT: ${JSON.stringify(anthropicKey)} } }`,
      errors: [err('ANT', 'Anthropic API key', 'sk-ant-a***')],
    },
    // Supabase service_role JWT — NOT anon
    {
      filename: NEXT_CONFIG,
      code: `module.exports = { env: { S: ${JSON.stringify(supabaseServiceRole)} } }`,
      errors: [err('S', 'Supabase service_role JWT', supabaseServiceRole.slice(0, 8) + '***')],
    },
    // Quoted key
    {
      filename: NEXT_CONFIG,
      code: `module.exports = { env: { 'X-API': ${JSON.stringify(stripeSk)} } }`,
      errors: [err('X-API', 'Stripe live secret key', 'sk_live_***')],
    },
    // Multiple offenders → multiple errors
    {
      filename: NEXT_CONFIG,
      code: `module.exports = { env: { A: ${JSON.stringify(stripeSk)}, B: ${JSON.stringify(awsKey)} } }`,
      errors: [
        err('A', 'Stripe live secret key', 'sk_live_***'),
        err('B', 'AWS access key ID', 'AKIAAAAA***'),
      ],
    },
    // Computed inner key: still detected, key reported as '?'
    {
      filename: NEXT_CONFIG,
      code: `const N = 'X'; module.exports = { env: { [N]: ${JSON.stringify(stripeSk)} } }`,
      errors: [err('?', 'Stripe live secret key', 'sk_live_***')],
    },
  ],
}

describe('no-credential-shape-in-config-env', () => {
  new RuleTester({
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
    },
  }).run('eslint', NextESLintRule, tests)
})
