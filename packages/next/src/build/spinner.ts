import ora from 'next/dist/compiled/ora'
import * as Log from './output/log'
import { hrtimeBigIntDurationToString } from './duration-to-string'

const dotsSpinner = {
  frames: ['.', '..', '...'],
  interval: 200,
}

export default function createSpinner(
  text: string,
  options: ora.Options = {},
  logFn: (...data: any[]) => void = console.log
) {
  let prefixText = ` ${Log.prefixes.info} ${text} `
  const progressStart = process.hrtime.bigint()

  if (process.stdout.isTTY) {
    let spinner = ora({
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
      const isInProgress = spinner.isSpinning
      if (isInProgress) {
        // Reset the current running spinner to empty line by `\r`
        spinner.prefixText = '\r'
        spinner.text = '\r'
        spinner.clear()
        origStop()
      }
      method(...args)
      if (isInProgress) {
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
      spinner.prefixText = prefixText
      return spinner
    }
    spinner.stop = () => {
      origStop()
      resetLog()
      return spinner
    }
    spinner.stopAndPersist = () => {
      const duration = process.hrtime.bigint() - progressStart
      text = `${text} in ${hrtimeBigIntDurationToString(duration)}`
      prefixText = ` ${Log.prefixes.info} ${text} `
      spinner.prefixText = prefixText
      origStopAndPersist()
      resetLog()
      return spinner
    }
    return spinner
  } else {
    text = ` ${Log.prefixes.info} ${text} `
    logFn(text)

    // @ts-ignore
    let spinner = {
      isSpinning: false,
      prefixText: '',
      text: '',
      clear: '',
      setText(newText: string) {
        text = ` ${Log.prefixes.info} ${newText}`
        logFn(text)
      },
      stop: () => spinner,
      stopAndPersist: () => {
        const duration = process.hrtime.bigint() - progressStart
        logFn(`${text} in ${hrtimeBigIntDurationToString(duration)}`)
        return spinner!
      },
    } as ora.Ora & { setText: (text: string) => void }

    return spinner
  }
}
