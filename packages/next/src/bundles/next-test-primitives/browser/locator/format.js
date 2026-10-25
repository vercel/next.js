import { stringify } from '@vitest/utils/display'
import {
  SelectorEngine,
  asLocator,
  getByRoleSelector,
  getByAltTextSelector,
  getByLabelSelector,
  getByPlaceholderSelector,
  getByTestIdSelector,
  getByTextSelector,
  getByTitleSelector,
} from './locators'
import { generateAriaTree, renderAriaTree } from './aria'

/** Pure DOM formatting from the pinned Browser primitives; no controller. */
export function createBrowserLocatorFormatter() {
  const engine = SelectorEngine.create({
    testIdAttribute: 'data-testid',
    browser: 'chromium',
    exact: true,
  })
  const selectors = {
    Role: getByRoleSelector,
    AltText: getByAltTextSelector,
    LabelText: getByLabelSelector,
    PlaceholderText: getByPlaceholderSelector,
    Text: getByTextSelector,
    Title: getByTitleSelector,
    TestId: (value) => getByTestIdSelector('data-testid', value),
  }
  return {
    selector(name, args) {
      return selectors[name](...args)
    },
    asLocator(selector) {
      return asLocator('javascript', selector)
    },
    generateSelector(element) {
      return engine.generateSelectorSimple(element)
    },
    strictError(selector, elements) {
      return engine.strictModeViolationError(
        engine.parseSelector(selector),
        elements
      )
    },
    missingError(selector, container) {
      const pretty = stringify(container, Infinity, {
        maxLength: 7000,
        highlight: true,
      })
      const html =
        container.outerHTML.length > 7000
          ? `${pretty.slice(0, 7000)}...`
          : pretty
      const aria = renderAriaTree(generateAriaTree(container))
      const error = new Error(
        `Cannot find element with locator: ${asLocator('javascript', selector)}\n\nARIA tree:\n${aria}\n\nHTML:\n${html}`
      )
      error.name = 'VitestBrowserElementError'
      return error
    },
  }
}
