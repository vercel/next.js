import ora from 'next/dist/compiled/ora'
import * as Log from './output/log'

const dotsSpinner = {
  frames: ['.', '..', '...'],
  interval: 200,
}

export default function createSpinner(
  text: string,
  options: ora.Options = {},
  logFn: (...data: any[]) => void = console.log
) {
  let spinner: undefined | ora.Ora

  const prefixText = ` ${Log.prefixes.info} ${text} `
  // Add \r at beginning to reset the current line of loading status text
  const suffixText = `\r ${Log.prefixes.event} ${text} `

  if (process.stdout.isTTY) {
    spinner = ora({
      text: undefined,
      prefixText,
      spinner: dotsSpinner,
      stream: process.stdout,
      ...options,
    }).start()

    // Add capturing of console.log/warn/error to allow pausing
    // the spinner before logging and then restarting spinner after
    const origLog = console.log
    const origWarn = console.warn
    const origError = console.error
    const origStop = spinner.stop.bind(spinner)
    const origStopAndPersist = spinner.stopAndPersist.bind(spinner)

    const logHandle = (method: any, args: any[]) => {
      origStop()
      method(...args)
      spinner!.start()
    }

    console.log = (...args: any) => logHandle(origLog, args)
    console.warn = (...args: any) => logHandle(origWarn, args)
    console.error = (...args: any) => logHandle(origError, args)

    const resetLog = () => {
      console.log = origLog
      console.warn = origWarn
      console.error = origError
    }
    spinner.stop = (): ora.Ora => {
      origStop()
      resetLog()
      return spinner!
    }
    spinner.stopAndPersist = (): ora.Ora => {
      if (suffixText) {
        if (spinner) {
          spinner.text = suffixText
        } else {
          logFn(suffixText)
        }
      }
      origStopAndPersist()
      resetLog()
      return spinner!
    }
  } else if (prefixText || text) {
    logFn(prefixText ? prefixText + '...' : text)
  }

  return spinner
}
