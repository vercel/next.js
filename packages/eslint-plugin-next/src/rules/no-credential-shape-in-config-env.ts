import { defineRule } from '../utils/define-rule'

const url = 'https://nextjs.org/docs/messages/no-credential-shape-in-config-env'

// Anchored prefixes plus minimum-length floors. Public-by-design identifiers
// (Stripe pk_, Firebase apiKey, PostHog phc_, Supabase anon JWT, Sentry DSN,
// Mapbox pk., Google Maps AIzaSy, Algolia search keys) must NOT match.
const SECRET_SHAPES = [
  { name: 'Stripe live secret key', re: /^sk_live_[A-Za-z0-9]{24,}$/ },
  { name: 'Stripe test secret key', re: /^sk_test_[A-Za-z0-9]{24,}$/ },
  { name: 'Stripe restricted key', re: /^rk_(?:live|test)_[A-Za-z0-9]{24,}$/ },
  { name: 'AWS access key ID', re: /^AKIA[A-Z0-9]{16}$/ },
  { name: 'GitHub personal access token', re: /^ghp_[A-Za-z0-9]{36}$/ },
  { name: 'GitHub OAuth token', re: /^gho_[A-Za-z0-9]{36}$/ },
  { name: 'GitHub fine-grained PAT', re: /^github_pat_[A-Za-z0-9_]{82,}$/ },
  { name: 'GitHub App installation token', re: /^ghs_[A-Za-z0-9]{36}$/ },
  { name: 'OpenAI API key', re: /^sk-(?:proj|svcacct|admin)-[A-Za-z0-9_-]{40,}$/ },
  { name: 'OpenAI legacy API key', re: /^sk-[A-Za-z0-9]{20}T3BlbkFJ[A-Za-z0-9]{20}$/ },
  { name: 'Anthropic API key', re: /^sk-ant-api03-[A-Za-z0-9_-]{40,}$/ },
  { name: 'Slack bot token', re: /^xoxb-[A-Za-z0-9-]{10,}$/ },
  { name: 'Slack user token', re: /^xoxp-[A-Za-z0-9-]{10,}$/ },
  { name: 'SendGrid API key', re: /^SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/ },
  { name: 'npm access token', re: /^npm_[A-Za-z0-9]{36}$/ },
  { name: 'PEM private key', re: /^-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  // Supabase keys are JWTs. anon role is intentionally public; service_role bypasses RLS.
  { name: 'Supabase service_role JWT', test: (v) => decodeJwtRole(v) === 'service_role' },
]

function decodeJwtRole(v) {
  if (!v.startsWith('eyJ')) return null
  const parts = v.split('.')
  if (parts.length !== 3) return null
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf8')
    )
    return typeof payload?.role === 'string' ? payload.role : null
  } catch {
    return null
  }
}

function matchShape(v) {
  if (v.length < 16) return null
  for (const shape of SECRET_SHAPES) {
    const hit = shape.re ? shape.re.test(v) : shape.test(v)
    if (hit) return shape.name
  }
  return null
}

function maskValue(v) {
  if (v.startsWith('-----BEGIN')) return '-----BEGIN ... PRIVATE KEY-----'
  return v.slice(0, 8) + '***'
}

function isNextConfigFile(filename) {
  if (!filename) return false
  const base = filename.replace(/\\/g, '/').split('/').pop() || ''
  return /^next\.config\.(js|mjs|cjs|ts|mts|cts)$/.test(base)
}

function keyName(node) {
  if (node.computed) return null
  if (node.key.type === 'Identifier') return node.key.name
  if (node.key.type === 'Literal' && typeof node.key.value === 'string') {
    return node.key.value
  }
  return null
}

export default defineRule({
  meta: {
    docs: {
      description:
        'Warn when a string literal under `env` in `next.config.js` has the shape of a server-only credential.',
      recommended: false,
      url,
    },
    type: 'problem',
    schema: [],
    messages: {
      credentialShape:
        '`env.{{key}}` value ({{masked}}) matches the shape of a {{shape}}. Values under `env` in `next.config.js` are inlined into the client bundle. See: ' +
        url,
    },
  },

  create(context) {
    if (!isNextConfigFile(context.filename)) {
      return {}
    }

    return {
      Property(node) {
        if (node.value.type !== 'Literal') return
        if (typeof node.value.value !== 'string') return

        // Parent ObjectExpression must be the value of an outer `env: {...}` Property.
        const parentObject = node.parent
        if (parentObject?.type !== 'ObjectExpression') return
        const envProperty = parentObject.parent
        if (envProperty?.type !== 'Property') return
        const envKey = keyName(envProperty)
        if (envKey !== 'env') return

        const value = node.value.value
        const shape = matchShape(value)
        if (!shape) return

        context.report({
          node,
          messageId: 'credentialShape',
          data: {
            key: keyName(node) ?? '?',
            shape,
            masked: maskValue(value),
          },
        })
      },
    }
  },
})
