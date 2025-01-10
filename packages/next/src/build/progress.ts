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

  const run = () => {
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
    const message = `${label} (${curProgress}/${total})`
    if (progressSpinner && !isFinished) {
      progressSpinner.setText(message)
    } else {
      progressSpinner?.stop()
      if (isFinished) {
        Log.event(message)
      } else {
        Log.info(`${message} ${process.stdout.isTTY ? '\n' : '\r'}`)
      }
    }
  }

  const clear = () => {
    if (
      progressSpinner &&
      // Ensure only reset and clear once to avoid set operation overflow in ora
      progressSpinner.isSpinning
    ) {
      progressSpinner.prefixText = '\r'
      progressSpinner.text = '\r'
      progressSpinner.clear()
      progressSpinner.stop()
    }
  }

  return {
    run,
    clear,
  }
}
