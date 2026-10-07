import ora from 'ora'
import * as Log from './log'

const dotsSpinner = {
  frames: ['.', '..', '...'],
  interval: 200,
}

// Mirrors Next.js' CLI spinner so upgrade progress looks the same as before.
export default function createSpinner(
  text: string,
  options: ora.Options = {},
  logFn: (...data: any[]) => void = console.log
) {
  let spinner: undefined | ora.Ora

  const prefixText = `${Log.prefixes.info} ${text} `

  if (process.stdout.isTTY) {
    spinner = ora({
      text: undefined,
      prefixText,
      spinner: dotsSpinner,
      stream: process.stdout,
      ...options,
    }).start()

    // Pause the spinner around console output so messages don't end up on the
    // spinner's line, then restart it.
    const origLog = console.log
    const origWarn = console.warn
    const origError = console.error
    const origStop = spinner.stop.bind(spinner)

    const logHandle = (method: any, args: any[]) => {
      const isInProgress = spinner?.isSpinning
      if (spinner && isInProgress) {
        // Reset the current running spinner to empty line by `\r`
        spinner.prefixText = '\r'
        spinner.text = '\r'
        spinner.clear()
        origStop()
      }
      method(...args)
      if (spinner && isInProgress) {
        spinner.start()
      }
    }

    console.log = (...args: any) => logHandle(origLog, args)
    console.warn = (...args: any) => logHandle(origWarn, args)
    console.error = (...args: any) => logHandle(origError, args)

    spinner.stop = () => {
      origStop()
      console.log = origLog
      console.warn = origWarn
      console.error = origError
      return spinner!
    }
  } else if (prefixText || text) {
    logFn(prefixText ? prefixText + '...' : text)
  }

  return spinner
}
