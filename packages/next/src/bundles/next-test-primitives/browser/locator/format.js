import { stringify } from '@vitest/utils/display'
import {
  SelectorEngine,
  escapeForTextSelector,
  asLocator,
  convertElementToCssSelector,
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
export function createBrowserLocatorFormatter({
  testIdAttribute = 'data-testid',
} = {}) {
  const engine = SelectorEngine.create({
    testIdAttribute,
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
    TestId: (value) => getByTestIdSelector(testIdAttribute, value),
  }
  return {
    selector(name, args) {
      return selectors[name](...args)
    },
    testIdSelector(attributeName, value) {
      return getByTestIdSelector(attributeName, value)
    },
    filterText(value) {
      return escapeForTextSelector(value)
    },
    createQuery(selector) {
      let parsed
      return () => {
        parsed ||= engine.parseSelector(selector())
        return engine.querySelectorAll(parsed, document.documentElement)
      }
    },
    asLocator(selector) {
      return asLocator('javascript', selector)
    },
    generateSelector(element) {
      return engine.generateSelectorSimple(element)
    },
    serializeElement(element) {
      if (!element || !(element instanceof Element))
        throw new Error(
          `Expected DOM element to be an instance of Element, received ${typeof element}`
        )
      return {
        selector: convertElementToCssSelector(element, 'playwright'),
        locator: asLocator(
          'javascript',
          engine.generateSelectorSimple(element)
        ),
      }
    },
    strictError(selector, elements) {
      return engine.strictModeViolationError(
        engine.parseSelector(selector),
        elements
      )
    },
    formatAriaTree(container) {
      return renderAriaTree(generateAriaTree(container))
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
