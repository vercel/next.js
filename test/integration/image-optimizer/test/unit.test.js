// TODO: should we allow `**` in the middle?

function isMatchingDomains(allowPattern, src) {
  const requestedUrl = new URL(src)
  const allowedUrl = new URL(allowPattern)

  if (allowedUrl.hostname.slice(2).includes('**')) {
    throw new Error('Should not contain ** in the middle')
  }
  const reqParts = requestedUrl.hostname.split('.').reverse()
  const allowParts = allowedUrl.hostname.split('.').reverse()

  const length = Math.max(allowParts.length, reqParts.length)
  for (let i = 0; i < length; i++) {
    // TODO: loop backwards instead of reverse()
    if (i === allowParts.length - 1) {
      if (allowParts[i] === '**') {
        break // we are at the end of the pattern and it is a wildcard
      }
    }
    if (reqParts[i] !== allowParts[i] && allowParts[i] !== '*') {
      return false // we found a part that didn't match
    }
  }

  return true
}

it('should work', async () => {
  expect(
    isMatchingDomains(
      'https://**.datocms-assets.com',
      'https://www.datocms-assets.com/account/test.jpg'
    )
  ).toBe(true)
  expect(
    isMatchingDomains(
      'https://*.datocms-assets.com',
      'https://www.datocms-assets.com/account/test.jpg'
    )
  ).toBe(true)
  expect(
    isMatchingDomains(
      'https://*.assets.datocms.com',
      'https://www.assets.datocms.com/account/test.jpg'
    )
  ).toBe(true)
  expect(
    isMatchingDomains(
      'https://**.assets.datocms.com',
      'https://www.assets.datocms.com/account/test.jpg'
    )
  ).toBe(true)
  expect(
    isMatchingDomains(
      'https://www.*.datocms.com',
      'https://www.assets.datocms.com/account/test.jpg'
    )
  ).toBe(true)
  expect(
    isMatchingDomains(
      'https://**.datocms.com',
      'https://www.assets.datocms.com/account/test.jpg'
    )
  ).toBe(true)
  expect(
    isMatchingDomains(
      'https://*.datocms.com',
      'https://www.assets.datocms.com/account/test.jpg'
    )
  ).toBe(false)
  expect(
    isMatchingDomains(
      'https://**.datocms.com.evil',
      'https://www.assets.datocms.com/account/test.jpg'
    )
  ).toBe(false)
})

it('should throw', async () => {
  expect(() =>
    isMatchingDomains(
      'https://www.**.com',
      'https://www.datocms-assets.com/account/test.jpg'
    )
  ).toThrow()
  expect(() =>
    isMatchingDomains(
      'https://www.**.foo.com',
      'https://www.datocms-assets.com/account/test.jpg'
    )
  ).toThrow()
  expect(() =>
    isMatchingDomains(
      'https://www.foo.**.com',
      'https://www.datocms-assets.com/account/test.jpg'
    )
  ).toThrow()
  expect(() =>
    isMatchingDomains(
      'https://www.foo.**',
      'https://www.datocms-assets.com/account/test.jpg'
    )
  ).toThrow()
})

// TODO: check all of these
const domains = [
  'www.datocms-assets.com/account/**',
  '**.datocms-assets.com',
  'account.*.datocms-assets.com',
  'account.*.datocms-assets.com/*/account',
]
