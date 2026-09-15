/* eslint-env jest */
const { readFileSync } = require('fs')
const { join } = require('path')

const gtmSource = readFileSync(
  join(__dirname, '../../packages/third-parties/src/google/gtm.tsx'),
  'utf8'
)

describe('@next/third-parties GoogleTagManager default script URL', () => {
  it('defaults gtmScriptUrl to googletagmanager.com/gtag/js', () => {
    expect(gtmSource).toContain(
      "gtmScriptUrl || 'https://www.googletagmanager.com/gtag/js'"
    )
    expect(gtmSource).not.toContain(
      "gtmScriptUrl || 'https://www.googletagmanager.com/gtm.js'"
    )
  })
})
