/* global getComputedStyle */

export async function getReactErrorOverlayContent (page) {
  await page.waitFor('iframe')
  const frame = await page.frames()[1]
  await frame.waitForSelector('div>div>div')
  const $body = await frame.$('body')
  /* istanbul ignore next */
  return frame.evaluate(e => e.innerHTML, $body)
}

export function getElementText (page, selector) {
  /* istanbul ignore next */
  return page.evaluate(sel =>
    document.querySelector(sel).innerText,
  selector
  )
}

export function getAttribute (page, selector, attribute) {
  /* istanbul ignore next */
  return page.evaluate((sel, attr) =>
    document.querySelector(sel).getAttribute(attr),
  selector, attribute
  )
}

export function getComputedCSS (page, selector, property) {
  /* istanbul ignore next */
  return page.evaluate((sel, prop) => {
    const el = document.querySelector(sel)
    return getComputedStyle(el).getPropertyValue(prop)
  },
  selector, property
  )
}
