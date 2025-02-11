// eslint-disable-next-line import/no-extraneous-dependencies
import { expect } from '@storybook/jest'

/**
 * Best usage inside a story's `play()` function.
 *
 * Used `aria-label` as the selector for seamless migration to
 * `getByLabelText()` in the future.
 *
 * @reference https://storybook.js.org/docs/writing-stories/play-function
 */
export function getElementsFromShadowPortal() {
  // TODO: Along with the next-test-utils, is there a better way to target
  // the portal?
  const portal = [].slice
    .call(document.querySelectorAll('nextjs-portal'))
    .find((p: any) =>
      p.shadowRoot.querySelector('[data-nextjs-dialog-overlay]')
    ) as unknown as Element

  const root = portal?.shadowRoot
  if (!root) {
    throw new Error('No shadow root found.')
  }

  const prevNav = root.querySelector('[aria-label="Previous Error"]')!
  expect(prevNav).toBeInTheDocument()
  expect(prevNav).toBeVisible()

  const nextNav = root.querySelector('[aria-label="Next Error"]')!
  expect(nextNav).toBeInTheDocument()
  expect(nextNav).toBeVisible()

  const versionStaleness = root.querySelector(
    '[aria-label="Next.js Version Staleness Indicator"]'
  )!
  expect(versionStaleness).toBeInTheDocument()
  expect(versionStaleness).toBeVisible()

  const errorTypeLabel = root.querySelector('[aria-label="Error Type Label"]')!
  expect(errorTypeLabel).toBeInTheDocument()
  expect(errorTypeLabel).toBeVisible()

  return {
    prevNav,
    nextNav,
    versionStaleness,
    errorTypeLabel,
  }
}
