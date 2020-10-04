let globalTeardown = () => {}

if (process.env.BROWSERSTACK) {
  globalTeardown = () => global.browserStackLocal.killAllProcesses(() => {})
}

module.exports = async () => {
  await globalTeardown()
}
