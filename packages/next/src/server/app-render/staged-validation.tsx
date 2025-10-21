import { getLayoutOrPageModule } from '../lib/app-dir-module'
import type { LoaderTree } from '../lib/app-dir-module'
import { parseLoaderTree } from '../../shared/lib/router/utils/parse-loader-tree'
import type { AppSegmentConfig } from '../../build/segment-config/app/app-segment-config'
import { RenderStage } from './staged-rendering'
import { createPromiseWithResolvers } from '../../shared/lib/promise-with-resolvers'

export async function anySegmentHasRuntimePrefetchEnabled(
  tree: LoaderTree
): Promise<boolean> {
  const { mod: layoutOrPageMod } = await getLayoutOrPageModule(tree)

  // TODO(restart-on-cache-miss): Does this work correctly for client page/layout modules?
  const prefetchConfig = layoutOrPageMod
    ? (layoutOrPageMod as AppSegmentConfig).unstable_prefetch
    : undefined
  /** Whether this segment should use a runtime prefetch instead of a static prefetch. */
  const hasRuntimePrefetch = prefetchConfig?.mode === 'runtime'
  if (hasRuntimePrefetch) {
    return true
  }

  const { parallelRoutes } = parseLoaderTree(tree)
  for (const parallelRouteKey in parallelRoutes) {
    const parallelRoute = parallelRoutes[parallelRouteKey]
    const hasChildRuntimePrefetch =
      await anySegmentHasRuntimePrefetchEnabled(parallelRoute)
    if (hasChildRuntimePrefetch) {
      return true
    }
  }

  return false
}

export type StageChunks = {
  chunks: ChunksByStage
  finishedIn: Promise<RenderStage>
}
export type ChunksByStage = Record<RenderStage, Promise<Uint8Array[]>>

export function collectStageChunksFromStagedRender(
  getCurrentStage: () => RenderStage,
  preventUnhandledRejection = false
) {
  let lastChunkStage: RenderStage | null = null
  const chunks: Record<RenderStage, Uint8Array[]> = {
    [RenderStage.Static]: [],
    [RenderStage.Runtime]: [],
    [RenderStage.Dynamic]: [],
  }

  const resultPromises: Record<
    RenderStage,
    PromiseWithResolvers<Uint8Array[]>
  > = {
    [RenderStage.Static]: createPromiseWithResolvers(),
    [RenderStage.Runtime]: createPromiseWithResolvers(),
    [RenderStage.Dynamic]: createPromiseWithResolvers(),
  }

  const finishedIn = createPromiseWithResolvers<RenderStage>()

  if (preventUnhandledRejection) {
    for (const controller of [finishedIn, ...Object.values(resultPromises)]) {
      controller.promise.catch(ignoreReject)
    }
  }

  // Gather the chunks and group them into stages.
  const transform = new TransformStream<Uint8Array, Uint8Array>({
    // TODO: is this some BYOBStream nonsesnse? is stuff getting queued???
    start() {
      // const currentStage = getCurrentStage()
      // console.log('collecting chunks :: start', RenderStage[currentStage])
    },
    transform(chunk, controller) {
      controller.enqueue(chunk)

      const currentStage = getCurrentStage()
      // console.log('collecting chunks :: transform', RenderStage[currentStage])
      if (lastChunkStage !== null && lastChunkStage !== currentStage) {
        console.log(
          'collecting chunks :: stage completed',
          RenderStage[lastChunkStage],
          chunks[lastChunkStage].length
        )
        chunks[currentStage].push(...chunks[lastChunkStage])
        resultPromises[lastChunkStage].resolve(chunks[currentStage])
      }

      if (currentStage !== RenderStage.Dynamic) {
        queueMicrotask(() => {
          console.log(
            'collecting chunks :: got chunk',
            RenderStage[currentStage],
            chunks[currentStage].length
          )
        })
      }
      chunks[currentStage].push(chunk)
      lastChunkStage = currentStage
    },
    flush() {
      lastChunkStage ??= getCurrentStage()
      // console.log('collecting chunks :: flush', lastChunkStage)
      // Make sure all promises are resolved
      for (const stage of [
        RenderStage.Static,
        RenderStage.Runtime,
        RenderStage.Dynamic,
      ]) {
        resultPromises[stage].resolve(chunks[stage])
      }
      finishedIn.resolve(lastChunkStage)
      queueMicrotask(() => {
        for (const stage of [
          RenderStage.Static,
          RenderStage.Runtime,
          RenderStage.Dynamic,
        ]) {
          console.log(
            'collecting chunks :: final chunk count for',
            RenderStage[stage],
            chunks[stage].length
          )
        }
      })
    },
  })

  const result: StageChunks = {
    chunks: {
      [RenderStage.Static]: resultPromises[RenderStage.Static].promise,
      [RenderStage.Runtime]: resultPromises[RenderStage.Runtime].promise,
      [RenderStage.Dynamic]: resultPromises[RenderStage.Dynamic].promise,
    },
    finishedIn: finishedIn.promise,
  }
  return [transform, result] as const
}

// export function collectStageChunksFromStagedRenderOld(
//   stream: ReadableStream<Uint8Array>,
//   getCurrentStage: () => RenderStage,
//   preventUnhandledRejection = false
// ): StageChunks {
//   let lastChunkStage: RenderStage | null = null
//   const chunks: Record<RenderStage, Uint8Array[]> = {
//     [RenderStage.Static]: [],
//     [RenderStage.Runtime]: [],
//     [RenderStage.Dynamic]: [],
//   }

//   const resultPromises: Record<
//     RenderStage,
//     PromiseWithResolvers<Uint8Array[]>
//   > = {
//     [RenderStage.Static]: createPromiseWithResolvers(),
//     [RenderStage.Runtime]: createPromiseWithResolvers(),
//     [RenderStage.Dynamic]: createPromiseWithResolvers(),
//   }

//   const finishedIn = createPromiseWithResolvers<RenderStage>()

//   const rejectPendingResults = (err: unknown) => {
//     for (const controller of [finishedIn, ...Object.values(resultPromises)]) {
//       if (preventUnhandledRejection) {
//         controller.promise.catch(ignoreReject)
//       }
//       controller.reject(err)
//     }
//   }
//   // Gather the chunks and group them into stages.
//   void (async () => {
//     const reader = stream.getReader()
//     while (true) {
//       let item: ReadableStreamReadResult<Uint8Array<ArrayBufferLike>>
//       try {
//         item = await reader.read()
//       } catch (err) {
//         rejectPendingResults(err)
//         return
//       }
//       const currentStage = getCurrentStage()
//       // console.debug(
//       //   'collecting chunks',
//       //   item.done ? 'done' : 'in progress',
//       //   currentStage
//       // )
//       if (!item.done) {
//         // If we changed to a new stage, we have to copy over the chunks emitted in the previous stage --
//         // stage N+1 is a superset of stage N.
//         if (lastChunkStage !== null && lastChunkStage !== currentStage) {
//           chunks[currentStage].push(...chunks[lastChunkStage])
//           resultPromises[lastChunkStage].resolve(chunks[currentStage])
//         }

//         chunks[currentStage].push(item.value)
//         lastChunkStage = currentStage
//       } else {
//         // TODO: we should consider an API that allows yielding a stage's chunks as soon as it completes
//         resultPromises[currentStage].resolve(chunks[currentStage])
//         finishedIn.resolve(currentStage)
//       }
//     }
//   })()

//   return {
//     chunks: {
//       [RenderStage.Static]: resultPromises[RenderStage.Static].promise,
//       [RenderStage.Runtime]: resultPromises[RenderStage.Runtime].promise,
//       [RenderStage.Dynamic]: resultPromises[RenderStage.Dynamic].promise,
//     },
//     finishedIn: finishedIn.promise,
//   }
// }

export function collectStageChunksFromStagedRenderOld(
  stream: ReadableStream<Uint8Array>,
  getCurrentStage: () => RenderStage,
  preventUnhandledRejection = false
): StageChunks {
  let lastChunkStage: RenderStage | null = null
  const chunks: Record<RenderStage, Uint8Array[]> = {
    [RenderStage.Static]: [],
    [RenderStage.Runtime]: [],
    [RenderStage.Dynamic]: [],
  }

  const resultPromises: Record<
    RenderStage,
    PromiseWithResolvers<Uint8Array[]>
  > = {
    [RenderStage.Static]: createPromiseWithResolvers(),
    [RenderStage.Runtime]: createPromiseWithResolvers(),
    [RenderStage.Dynamic]: createPromiseWithResolvers(),
  }

  const finishedIn = createPromiseWithResolvers<RenderStage>()

  const rejectPendingResults = (err: unknown) => {
    for (const controller of [finishedIn, ...Object.values(resultPromises)]) {
      if (preventUnhandledRejection) {
        controller.promise.catch(ignoreReject)
      }
      controller.reject(err)
    }
  }
  // Gather the chunks and group them into stages.
  void (async () => {
    for await (const chunk of stream.values()) {
      const currentStage = getCurrentStage()

      // If we changed to a new stage, we have to copy over the chunks emitted in the previous stage --
      // stage N+1 is a superset of stage N.
      if (lastChunkStage !== null && lastChunkStage !== currentStage) {
        // TODO: fix skipped stages? maybe we just keep the delta,
        // and then concat when resolving? that'd be easier than backfilling skipped stages
        chunks[currentStage].push(...chunks[lastChunkStage])

        for (const stage of [
          RenderStage.Static,
          RenderStage.Runtime,
          RenderStage.Dynamic,
        ]) {
          if (stage <= lastChunkStage) {
            resultPromises[stage].resolve(chunks[stage])
          }
        }
        // resultPromises[lastChunkStage].resolve(chunks[lastChunkStage])
      }

      chunks[currentStage].push(chunk)
      lastChunkStage = currentStage
    }

    // Make sure all promises are resolved
    for (const stage of [
      RenderStage.Static,
      RenderStage.Runtime,
      RenderStage.Dynamic,
    ]) {
      resultPromises[stage].resolve(chunks[stage])
    }

    finishedIn.resolve(lastChunkStage ?? RenderStage.Static)
    // queueMicrotask(() => {
    //   for (const stage of [
    //     RenderStage.Static,
    //     RenderStage.Runtime,
    //     RenderStage.Dynamic,
    //   ]) {
    //     console.log(
    //       'collecting chunks :: final chunk count for',
    //       RenderStage[stage],
    //       chunks[stage].length
    //     )
    //   }
    // })
  })().catch((err) => rejectPendingResults(err))

  return {
    chunks: {
      [RenderStage.Static]: resultPromises[RenderStage.Static].promise,
      [RenderStage.Runtime]: resultPromises[RenderStage.Runtime].promise,
      [RenderStage.Dynamic]: resultPromises[RenderStage.Dynamic].promise,
    },
    finishedIn: finishedIn.promise,
  }
}

function ignoreReject() {}

// export function recreateServerStreamInStage(
//   stageChunks: StageChunks,
//   stage: RenderStage
// ) {
//   // If we're recreating a stream for a stage before the stream ended,
//   // then it won't be a complete RSC stream.
//   // (i.e. it'll contain references to rows that never appear).
//   // In that case, the stream should stay unclosed to avoid "Connection Closed" from Fizz.
//   // (see `createUnclosingPrefetchStream` for more explanation)
//   const shouldClose = stage < stageChunks.finishedIn ? false : true
//   return streamFromChunks(stageChunks.chunks[stage], shouldClose)
// }

export function streamFromChunks(
  chunks: Uint8Array[],
  shouldClose: boolean = true
): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk)
      }
      if (shouldClose) {
        controller.close()
      }
    },
  })
}
