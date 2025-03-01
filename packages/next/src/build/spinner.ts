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
  let spinner: undefined | (ora.Ora & { setText: (text: string) => void })

  let prefixText = ` ${Log.prefixes.info} ${text} `

  if (process.stdout.isTTY) {
    spinner = ora({
      text: undefined,
      prefixText,
      spinner: dotsSpinner,
      stream: process.stdout,
      ...options,
    }).start() as ora.Ora & { setText: (text: string) => void }

    // Add capturing of console.log/warn/error to allow pausing
    // the spinner before logging and then restarting spinner after
    const origLog = console.log
    const origWarn = console.warn
    const origError = console.error
    const origStop = spinner.stop.bind(spinner)
    const origStopAndPersist = spinner.stopAndPersist.bind(spinner)

    const logHandle = (method: any, args: any[]) => {
      // Enter a new line before logging new message, to avoid
      // the new message shows up right after the spinner in the same line.
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

    const resetLog = () => {
      console.log = origLog
      console.warn = origWarn
      console.error = origError
    }
    spinner.setText = (newText) => {
      text = newText
      prefixText = ` ${Log.prefixes.info} ${newText} `
      spinner!.prefixText = prefixText
      return spinner!
    }
    spinner.stop = () => {
      origStop()
      resetLog()
      return spinner!
    }
    spinner.stopAndPersist = () => {
      // Add \r at beginning to reset the current line of loading status text
      const suffixText = `\r ${Log.prefixes.event} ${text} `
      if (spinner) {
        spinner.text = suffixText
      } else {
        logFn(suffixText)
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
