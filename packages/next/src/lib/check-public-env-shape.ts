import * as Log from '../build/output/log'

/**
 * Tier-1 credential shapes that must never be shipped to the browser.
 *
 * Anchored prefixes + minimum-length rules keep false positives near zero on
 * well-formed values. Public-by-design identifiers (Firebase `apiKey`, Stripe
 * `pk_`, PostHog project keys, Supabase `anon` JWT) are deliberately NOT
 * included — those are safe-by-design per their vendors' published security
 * models.
 *
 * Keep this list append-only; do not tighten existing patterns except with a
 * corresponding test case.
 */
interface SecretShape {
  name: string
  re?: RegExp
  test?: (v: string) => boolean
}

const SECRET_SHAPES: readonly SecretShape[] = [
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
  {
    name: 'PEM private key',
    re: /^-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/,
  },
  {
    // Supabase keys are JWTs. The `anon` role is intentionally public
    // (gated by Row Level Security). The `service_role` JWT bypasses RLS
    // and must never reach the browser. Decode payload and check role.
    name: 'Supabase service_role JWT',
    test: (v) => decodeJwtRole(v) === 'service_role',
  },
]

function decodeJwtRole(v: string): string | null {
  // Both call sites (`getNextPublicEnvironmentVariables` and `getNextConfigEnv`
  // via `getStaticEnv`) run at compile time in the Node build worker. Edge-
  // runtime Buffer polyfills do not need to handle this code path.
  if (typeof v !== 'string' || !v.startsWith('eyJ')) return null
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

/**
 * Emit a single build-time warning if `value` matches the shape of a Tier-1
 * credential. De-duplicates across a build via `Log.warnOnce`.
 *
 * @param key — the env var name. For a caller iterating `process.env` with the
 *   `NEXT_PUBLIC_` prefix, pass the raw key. For a caller iterating
 *   `next.config.js` `env`, pass the bare key plus `configEnv=true` so the
 *   warning names the correct inlining mechanism.
 */
export function checkPublicEnvShape(
  key: string,
  value: string,
  configEnv = false
): void {
  if (typeof value !== 'string' || value.length < 16) return
  for (const shape of SECRET_SHAPES) {
    const hit = shape.re ? shape.re.test(value) : shape.test!(value)
    if (!hit) continue
    const exposureReason = configEnv
      ? `"${key}" is listed under \`env\` in next.config.js, which inlines it into the client bundle`
      : `"${key}" begins with "NEXT_PUBLIC_", which inlines it into the client bundle`
    Log.warnOnce(
      `${key} value matches the shape of a ${shape.name}. ${exposureReason}. ` +
        `The value will be visible to every site visitor. ` +
        `To silence, rename the variable so its value does not match a known secret shape.`
    )
    return
  }
}
