import { getExecutablePath } from '@replayio/playwright'
import { Playwright } from './playwright'
export { quit } from './playwright'

export class Replay extends Playwright {
  async launchBrowser(browserName: string, launchOptions: Record<string, any>) {
    const browser: any = browserName === 'chrome' ? 'chromium' : browserName
    const executablePath = getExecutablePath(browser)

    if (!executablePath) {
      throw new Error(`No replay.io executable for browser \`${browserName}\``)
    }

    return super.launchBrowser(browserName, {
      ...launchOptions,
      executablePath,
      env: {
        ...process.env,
        RECORD_ALL_CONTENT: 1,
      },
    })
  }
}
