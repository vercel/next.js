let globalTeardown = () => {}
const browser = global.__directBrowser

if (process.env.BROWSERSTACK) {
  globalTeardown = () => global.browserStackLocal.killAllProcesses(() => {})
}

module.exports = async () => {
  if (browser) {
    // Close all remaining browser windows
    try {
      const windows = await browser.windowHandles()
      for (const window of windows) {
        if (!window) continue
        await browser.window(window)
        await browser.origClose()
        await browser.quit()
      }
    } catch (_) {}
  }
  await globalTeardown()
}
