export async function getReactErrorOverlayContent (page) {
  await page.waitFor('iframe')
  const frame = await page.frames()[1]
  await frame.waitForSelector('div>div>div')
  const $body = await frame.$('body')
  return frame.evaluate(e => e.innerHTML, $body)
}
