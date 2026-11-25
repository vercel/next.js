import { isAlreadyPublishedError } from '../../scripts/release-publish-error'

describe('release publish errors', () => {
  it.each([
    'You cannot publish over the previously published versions: 16.5.0-canary.65.',
    [
      'Error: ERR_PNPM_FAILED_TO_PUBLISH',
      '  × Failed to publish package @vercel/devlow-bench@16.5.0-canary.65 (status',
      '  │ 403 Forbidden): {"success":false,"error":"You cannot publish over the',
      '  │ previously published versions: 16.5.0-canary.65."}',
    ].join('\n'),
    'You cannot publish over the\r\n  │ previously published versions: 16.5.0-canary.65.',
    '\u001b[31mYou cannot publish over the\n  │ previously published versions: 16.5.0-canary.65.\u001b[0m',
  ])('recognizes an already published version in %s', (output) => {
    expect(isAlreadyPublishedError(output)).toBe(true)
  })

  it.each([
    '',
    'ERR_PNPM_FAILED_TO_PUBLISH: 403 Forbidden: authentication required',
    '403 Forbidden: You do not have permission to publish this package.',
    'Cannot publish prerelease versions with the latest tag.',
    'The package was previously published, but this request failed with 500.',
  ])('preserves other publishing failures in %s', (output) => {
    expect(isAlreadyPublishedError(output)).toBe(false)
  })
})
