import * as Log from '../build/output/log'
import createSpinner from './spinner'

function divideSegments(number: number, segments: number): number[] {
  const result = []
  while (number > 0 && segments > 0) {
    const dividedNumber =
      number < segments ? number : Math.floor(number / segments)

    number -= dividedNumber
    segments--
    result.push(dividedNumber)
  }
  return result
}

export const createProgress = (total: number, label: string) => {
  const segments = divideSegments(total, 4)

  if (total === 0) {
    throw new Error('invariant: progress total can not be zero')
  }
  let currentSegmentTotal = segments.shift()
  let currentSegmentCount = 0
  let lastProgressOutput = Date.now()
  let curProgress = 0
  let progressSpinner = createSpinner(`${label} (${curProgress}/${total})`, {
    spinner: {
      frames: [
        '[    ]',
        '[=   ]',
        '[==  ]',
        '[=== ]',
        '[ ===]',
        '[  ==]',
        '[   =]',
        '[    ]',
        '[   =]',
        '[  ==]',
        '[ ===]',
        '[====]',
        '[=== ]',
        '[==  ]',
        '[=   ]',
      ],
      interval: 200,
    },
  })

  return () => {
    curProgress++

    // Make sure we only log once
    // - per fully generated segment, or
    // - per minute
    // when not showing the spinner
    if (!progressSpinner) {
      currentSegmentCount++

      if (currentSegmentCount === currentSegmentTotal) {
        currentSegmentTotal = segments.shift()
        currentSegmentCount = 0
      } else if (lastProgressOutput + 60000 > Date.now()) {
        return
      }

      lastProgressOutput = Date.now()
    }

    const isFinished = curProgress === total
    // Use \r to reset current line with spinner.
    // If it's 100% progressed, then we don't need to break a new line to avoid logging from routes while building.
    const newText = `\r ${
      isFinished ? Log.prefixes.event : Log.prefixes.info
    } ${label} (${curProgress}/${total}) ${
      isFinished ? '' : process.stdout.isTTY ? '\n' : '\r'
    }`
    if (progressSpinner) {
      progressSpinner.text = newText
    } else {
      console.log(newText)
    }

    if (isFinished && progressSpinner) {
      progressSpinner.stop()
      console.log(newText)
    }
  }
}
