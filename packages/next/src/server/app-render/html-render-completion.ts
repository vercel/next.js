import { AppRenderSpan } from '../lib/trace/constants'
import {
  createOneShotTracePhase,
  type TracePhaseCompletion,
} from '../lib/trace/phase'

type HTMLRenderCompletionOwner = {
  readonly token: number
  readonly finishPhase: ReturnType<typeof createOneShotTracePhase>
}

export function createHTMLRenderCompletionTracker(
  finishRender: (completion?: TracePhaseCompletion) => void
) {
  let nextToken = 0
  let currentOwner: HTMLRenderCompletionOwner | undefined

  function settle(
    owner: HTMLRenderCompletionOwner,
    completion?: TracePhaseCompletion
  ) {
    if (currentOwner?.token !== owner.token) {
      return
    }

    currentOwner = undefined
    owner.finishPhase(completion)
    finishRender(completion)
  }

  return {
    track(allReady: Promise<unknown>) {
      const owner: HTMLRenderCompletionOwner = {
        token: ++nextToken,
        finishPhase: createOneShotTracePhase(
          AppRenderSpan.waitForHTMLCompletion,
          'wait for HTML completion'
        ),
      }
      currentOwner = owner

      void allReady.then(
        () => settle(owner),
        (error) => {
          queueMicrotask(() => {
            // Let the caller's awaited continuation enter recovery first.
            queueMicrotask(() => settle(owner, { error }))
          })
        }
      )
    },

    supersede(error: unknown) {
      const owner = currentOwner
      if (!owner) {
        return
      }

      currentOwner = undefined
      owner.finishPhase({ error })
    },
  }
}
