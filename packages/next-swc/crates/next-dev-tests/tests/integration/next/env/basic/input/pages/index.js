import { useTestHarness } from '@turbo/pack-test-harness'

export default function Page() {
  useTestHarness(runTests)
}

function runTests() {
  it('should support env vars from config', () => {
    expect(process.env.STRING_ENV_VAR_FROM_CONFIG).toBe('Hello World')
    expect(process.env.BOOLEAN_ENV_VAR_FROM_CONFIG).toBe('true')
    expect(process.env.NUMBER_ENV_VAR_FROM_CONFIG).toBe('123')
  })

  it('should support env vars from .env', () => {
    expect(process.env.NEXT_PUBLIC_STRING_ENV_VAR_FROM_DOT_ENV).toBe(
      'Hello World'
    )
    expect(process.env.NEXT_PUBLIC_BOOLEAN_ENV_VAR_FROM_DOT_ENV).toBe('true')
    expect(process.env.NEXT_PUBLIC_NUMBER_ENV_VAR_FROM_DOT_ENV).toBe('123')
  })

  it('should not support env vars from .env without NEXT_PUBLIC prefix', () => {
    expect(process.env.STRING_ENV_VAR_FROM_DOT_ENV).toBeUndefined()
    expect(process.env.BOOLEAN_ENV_VAR_FROM_DOT_ENV).toBeUndefined()
    expect(process.env.NUMBER_ENV_VAR_FROM_DOT_ENV).toBeUndefined()
  })
}
