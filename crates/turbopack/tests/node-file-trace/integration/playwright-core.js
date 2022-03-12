const playwright = require('playwright-core')

if (playwright.chromium.name() !== 'chromium')
  throw new Error('playwright-core: could not get name')

if (!playwright.chromium.executablePath())
  throw new Error('playwright-core: could not get executablePath')
