export async function getReactErrorOverlayContent (page) {
  await page.waitFor('iframe')
  const frame = await page.frames()[1]
  await frame.waitForSelector('div>div>div')
  const $body = await frame.$('body')
  return frame.evaluate(e => e.innerHTML, $body)
}

export function getElementText (page, selector) {
  return page.evaluate(sel =>
    document.querySelector(sel).innerText,
  selector
  )
}

export function getAttribute (page, selector, attribute) {
  return page.evaluate((sel, attr) =>
    document.querySelector(sel).getAttribute(attr),
  selector, attribute
  )
}
