// Opt in only in a test-specific tsconfig. Runtime aliases are supplied by next test.
declare module 'vitest/browser' {
  export {
    page,
    locators,
    utils,
    type Locator,
    type BrowserPage,
    type BrowserLocators,
    type LocatorSelectors,
    type PrettyDOMOptions,
  } from 'next/dist/experimental/testing/client/browser-context.js'
}

declare module '@vitest/browser/context' {
  export {
    page,
    locators,
    utils,
    type Locator,
    type BrowserPage,
    type BrowserLocators,
    type LocatorSelectors,
    type PrettyDOMOptions,
  } from 'next/dist/experimental/testing/client/browser-context.js'
}
