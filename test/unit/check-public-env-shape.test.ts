/* eslint-env jest */
import { checkPublicEnvShape } from 'next/dist/lib/check-public-env-shape'
import * as Log from 'next/dist/build/output/log'

jest.mock('next/dist/build/output/log', () => ({
  warn: jest.fn(),
  warnOnce: jest.fn(),
  info: jest.fn(),
  error: jest.fn(),
  errorOnce: jest.fn(),
  ready: jest.fn(),
  event: jest.fn(),
  trace: jest.fn(),
  wait: jest.fn(),
  bootstrap: jest.fn(),
}))

const mockedWarnOnce = Log.warnOnce as jest.Mock

function b64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64url')
}

function fakeJwt(payload: Record<string, unknown>): string {
  const h = b64url({ alg: 'HS256', typ: 'JWT' })
  const p = b64url(payload)
  const s = 'a'.repeat(43)
  return `${h}.${p}.${s}`
}

beforeEach(() => {
  mockedWarnOnce.mockClear()
})

describe('checkPublicEnvShape — positive matches (Tier-1 credential shapes)', () => {
  const positives: Array<[string, string, RegExp]> = [
    ['NEXT_PUBLIC_STRIPE_SK', 'sk_live_51' + 'A'.repeat(40), /Stripe live secret key/],
    ['NEXT_PUBLIC_STRIPE_TEST', 'sk_test_51' + 'A'.repeat(40), /Stripe test secret key/],
    ['NEXT_PUBLIC_STRIPE_RK', 'rk_live_' + 'A'.repeat(30), /Stripe restricted key/],
    ['NEXT_PUBLIC_AWS_KEY', 'AKIA' + 'A'.repeat(16), /AWS access key ID/],
    ['NEXT_PUBLIC_GH_PAT', 'ghp_' + 'a'.repeat(36), /GitHub personal access token/],
    ['NEXT_PUBLIC_GH_OAUTH', 'gho_' + 'a'.repeat(36), /GitHub OAuth token/],
    ['NEXT_PUBLIC_GH_FINE', 'github_pat_' + 'a'.repeat(82), /GitHub fine-grained PAT/],
    ['NEXT_PUBLIC_GH_APP', 'ghs_' + 'a'.repeat(36), /GitHub App installation token/],
    ['NEXT_PUBLIC_OPENAI_PROJ', 'sk-proj-' + 'A'.repeat(50), /OpenAI API key/],
    ['NEXT_PUBLIC_OPENAI_SVC', 'sk-svcacct-' + 'A'.repeat(50), /OpenAI API key/],
    ['NEXT_PUBLIC_OPENAI_ADMIN', 'sk-admin-' + 'A'.repeat(50), /OpenAI API key/],
    [
      'NEXT_PUBLIC_OPENAI_LEGACY',
      'sk-' + 'A'.repeat(20) + 'T3BlbkFJ' + 'B'.repeat(20),
      /OpenAI legacy API key/,
    ],
    ['NEXT_PUBLIC_ANTHROPIC', 'sk-ant-api03-' + 'A'.repeat(50), /Anthropic API key/],
    ['NEXT_PUBLIC_SLACK_BOT', 'xoxb-' + '1234567890-abcdefghijkl', /Slack bot token/],
    ['NEXT_PUBLIC_SLACK_USER', 'xoxp-' + '1234567890-abcdefghijkl', /Slack user token/],
    [
      'NEXT_PUBLIC_SENDGRID',
      'SG.' + 'A'.repeat(22) + '.' + 'B'.repeat(43),
      /SendGrid API key/,
    ],
    ['NEXT_PUBLIC_NPM', 'npm_' + 'A'.repeat(36), /npm access token/],
    [
      'NEXT_PUBLIC_PEM',
      '-----BEGIN RSA PRIVATE KEY-----\nMIIEvQI...',
      /PEM private key/,
    ],
  ]

  it.each(positives)(
    'warns when %s has value matching %s',
    (key, value, expectedRE) => {
      checkPublicEnvShape(key, value)
      expect(mockedWarnOnce).toHaveBeenCalledTimes(1)
      expect(mockedWarnOnce.mock.calls[0][0]).toMatch(expectedRE)
      expect(mockedWarnOnce.mock.calls[0][0]).toMatch(
        /begins with "NEXT_PUBLIC_"/
      )
    }
  )
})

describe('checkPublicEnvShape — public-by-design identifiers NOT warned', () => {
  const safeCases: Array<[string, string]> = [
    ['NEXT_PUBLIC_STRIPE_PK', 'pk_live_' + 'A'.repeat(40)],
    ['NEXT_PUBLIC_STRIPE_TEST_PK', 'pk_test_' + 'A'.repeat(40)],
    ['NEXT_PUBLIC_FIREBASE_API_KEY', 'AIzaSy' + 'A'.repeat(33)],
    ['NEXT_PUBLIC_GOOGLE_MAPS', 'AIzaSy' + 'A'.repeat(33)],
    ['NEXT_PUBLIC_POSTHOG_KEY', 'phc_' + 'a'.repeat(44)],
  ]

  it.each(safeCases)('does not warn on %s', (key, value) => {
    checkPublicEnvShape(key, value)
    expect(mockedWarnOnce).not.toHaveBeenCalled()
  })
})

describe('checkPublicEnvShape — Supabase JWT role discrimination', () => {
  it('warns on Supabase service_role JWT', () => {
    const jwt = fakeJwt({
      iss: 'supabase',
      role: 'service_role',
      exp: 9999999999,
    })
    checkPublicEnvShape('NEXT_PUBLIC_SUPABASE_KEY', jwt)
    expect(mockedWarnOnce).toHaveBeenCalledTimes(1)
    expect(mockedWarnOnce.mock.calls[0][0]).toMatch(
      /Supabase service_role JWT/
    )
  })

  it.each([['anon'], ['authenticated'], ['admin'], [undefined]] as const)(
    'Supabase JWT role=%s → does NOT warn',
    (role) => {
      const payload: Record<string, unknown> = { iss: 'supabase' }
      if (role !== undefined) payload.role = role
      const jwt = fakeJwt(payload)
      checkPublicEnvShape('NEXT_PUBLIC_SUPABASE_KEY', jwt)
      expect(mockedWarnOnce).not.toHaveBeenCalled()
    }
  )

  it('does not warn on malformed JWT', () => {
    checkPublicEnvShape('NEXT_PUBLIC_X', 'eyJbad.eyJbad.sig')
    expect(mockedWarnOnce).not.toHaveBeenCalled()
  })
})

describe('checkPublicEnvShape — short values and non-string inputs', () => {
  it.each(['true', 'false', '1', '0', 'dev', 'prod', 'yes', 'no'])(
    'does not warn on short value %p',
    (v) => {
      checkPublicEnvShape('NEXT_PUBLIC_FLAG', v)
      expect(mockedWarnOnce).not.toHaveBeenCalled()
    }
  )

  it('returns silently on non-string input', () => {
    // @ts-expect-error — exercising runtime guard on typed API
    checkPublicEnvShape('NEXT_PUBLIC_NUM', 12345)
    expect(mockedWarnOnce).not.toHaveBeenCalled()
  })
})

describe('checkPublicEnvShape — configEnv=true variant', () => {
  it('warns with "env config" exposure message when configEnv=true', () => {
    checkPublicEnvShape('API_SECRET', 'sk_live_51' + 'A'.repeat(40), true)
    expect(mockedWarnOnce).toHaveBeenCalledTimes(1)
    expect(mockedWarnOnce.mock.calls[0][0]).toMatch(
      /is listed under `env` in next.config.js/
    )
    expect(mockedWarnOnce.mock.calls[0][0]).not.toMatch(
      /begins with "NEXT_PUBLIC_"/
    )
  })
})
