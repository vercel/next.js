import { scheduleImmediate } from '../../lib/scheduler'
import { ENCODED_TAGS } from '../stream-utils/encodedTags'
import { indexOfUint8Array } from '../stream-utils/uint8array-helpers'

// We can share the same encoder instance everywhere
// Notably we cannot do the same for TextDecoder because it is stateful
// when handling streaming data
const encoder = new TextEncoder()

enum StreamStatus {
  PENDING,
  COMPLETE,
}

type StreamState = {
  taskId: number
  status: StreamStatus
  blockedRead: Promise<ReadableStreamReadResult<Uint8Array>>
  blockedInlinedDataRead: null | Promise<ReadableStreamReadResult<Uint8Array>>
  suffix: null | Uint8Array
}

export function createDynamicPrerenderStream(
  reactStream: ReadableStream<Uint8Array>,
  getServerInsertedHTML: () => Promise<string>
): ReadableStream<Uint8Array> {
  const reactReader = reactStream.getReader()
  const queue: Array<Uint8Array> = []
  let streamState: null | StreamState = null

  return new ReadableStream({
    async pull(controller: ReadableStreamDefaultController) {
      if (streamState === null) {
        streamState = {
          taskId: 0,
          status: StreamStatus.PENDING,
          blockedRead: reactReader.read(),
          blockedInlinedDataRead: null,
          suffix: null,
        }
        await pullShell(
          controller,
          queue,
          streamState,
          reactReader,
          getServerInsertedHTML
        )
      } else if (streamState.status !== StreamStatus.COMPLETE) {
        throw new Error(
          'Invariant: Prerender streams are expected to complete in a single pull'
        )
      } else {
        // For prerenders we don't want to close the document so we
        // eliminate the suffix even if it was discovered
        streamState.suffix = null
        return closeCompletedStream(controller, queue, streamState)
      }
    },
  })
}

export function createStaticPrerenderStream(
  reactStream: ReadableStream<Uint8Array>,
  inlinedDataStream: ReadableStream<Uint8Array>,
  getServerInsertedHTML: () => Promise<string>
): ReadableStream<Uint8Array> {
  const reactReader = reactStream.getReader()
  const inlinedDataReader = inlinedDataStream.getReader()
  const queue: Array<Uint8Array> = []
  let streamState: null | StreamState = null

  return new ReadableStream({
    async pull(controller: ReadableStreamDefaultController) {
      if (streamState === null) {
        streamState = {
          taskId: 0,
          status: StreamStatus.PENDING,
          blockedRead: reactReader.read(),
          blockedInlinedDataRead: null,
          suffix: null,
        }
        await pullShell(
          controller,
          queue,
          streamState,
          reactReader,
          getServerInsertedHTML
        )
      } else if (streamState.status !== StreamStatus.COMPLETE) {
        throw new Error(
          'Invariant: Prerender streams are expected to complete in a single pull'
        )
      } else {
        await eagerlyPullInlinedDataStream(
          controller,
          streamState,
          inlinedDataReader
        )
        return closeCompletedStream(controller, queue, streamState)
      }
    },
  })
}

export function createDynamicHTMLResumeStream(
  reactStream: ReadableStream<Uint8Array>,
  inlinedDataStream: ReadableStream<Uint8Array>,
  getServerInsertedHTML: () => Promise<string>
): ReadableStream<Uint8Array> {
  const reactReader = reactStream.getReader()
  const inlinedDataReader = inlinedDataStream.getReader()
  const queue: Array<Uint8Array> = []
  let streamState: null | StreamState = null

  return new ReadableStream({
    async pull(controller: ReadableStreamDefaultController) {
      if (streamState === null) {
        streamState = {
          taskId: 0,
          status: StreamStatus.PENDING,
          blockedRead: reactReader.read(),
          blockedInlinedDataRead: null,
          // We assume the suffix was body and html for the prelude
          suffix: ENCODED_TAGS.CLOSED.BODY_AND_HTML.slice(),
        }
        await pullShell(
          controller,
          queue,
          streamState,
          reactReader,
          getServerInsertedHTML
        )
      } else if (streamState.status !== StreamStatus.COMPLETE) {
        lazilyPullInlinedDataStream(controller, streamState, inlinedDataReader)
        await pullStream(
          controller,
          queue,
          streamState,
          reactReader,
          getServerInsertedHTML
        )
      } else {
        await eagerlyPullInlinedDataStream(
          controller,
          streamState,
          inlinedDataReader
        )
        return closeCompletedStream(controller, queue, streamState)
      }
    },
  })
}

export function createDynamicDataResumeStream(
  inlinedDataStream: ReadableStream<Uint8Array>
): ReadableStream<Uint8Array> {
  const inlinedDataReader = inlinedDataStream.getReader()
  const suffixChunk = ENCODED_TAGS.CLOSED.BODY_AND_HTML.slice()

  return new ReadableStream({
    async pull(controller: ReadableStreamDefaultController) {
      while (true) {
        const { done, value: chunk } = await inlinedDataReader.read()
        if (done) {
          controller.enqueue(suffixChunk)
          controller.close()
        }

        controller.enqueue(chunk)
      }
    },
  })
}

export function createStaticRenderStream(
  reactStream: ReadableStream<Uint8Array>,
  inlinedDataStream: ReadableStream<Uint8Array>,
  getServerInsertedHTML: () => Promise<string>,
  devMode: boolean
): ReadableStream<Uint8Array> {
  const reactReader = reactStream.getReader()
  const inlinedDataReader = inlinedDataStream.getReader()
  const queue: Array<Uint8Array> = []
  let streamState: null | StreamState = null

  const renderStream = new ReadableStream({
    async pull(controller: ReadableStreamDefaultController) {
      const allReady = (reactStream as any).allReady
      if (typeof allReady === 'object' && typeof allReady.then === 'function') {
        await allReady
      }

      if (streamState === null) {
        streamState = {
          taskId: 0,
          status: StreamStatus.PENDING,
          blockedRead: reactReader.read(),
          blockedInlinedDataRead: null,
          suffix: null,
        }
        await pullShell(
          controller,
          queue,
          streamState,
          reactReader,
          getServerInsertedHTML
        )
      } else if (streamState.status !== StreamStatus.COMPLETE) {
        lazilyPullInlinedDataStream(controller, streamState, inlinedDataReader)
        await pullStream(
          controller,
          queue,
          streamState,
          reactReader,
          getServerInsertedHTML
        )
      } else {
        await eagerlyPullInlinedDataStream(
          controller,
          streamState,
          inlinedDataReader
        )
        return closeCompletedStream(controller, queue, streamState)
      }
    },
  })

  if (devMode) {
    return renderStream.pipeThrough(createRootLayoutValidatorStream())
  } else {
    return renderStream
  }
}

export function createDynamicRenderStream(
  reactStream: ReadableStream<Uint8Array>,
  inlinedDataStream: ReadableStream<Uint8Array>,
  getServerInsertedHTML: () => Promise<string>,
  devMode: boolean
): ReadableStream<Uint8Array> {
  const reactReader = reactStream.getReader()
  const inlinedDataReader = inlinedDataStream.getReader()
  const queue: Array<Uint8Array> = []
  let streamState: null | StreamState = null

  const renderStream = new ReadableStream({
    async pull(controller: ReadableStreamDefaultController) {
      if (streamState === null) {
        streamState = {
          taskId: 0,
          status: StreamStatus.PENDING,
          blockedRead: reactReader.read(),
          blockedInlinedDataRead: null,
          suffix: null,
        }
        await pullShell(
          controller,
          queue,
          streamState,
          reactReader,
          getServerInsertedHTML
        )
      } else if (streamState.status !== StreamStatus.COMPLETE) {
        lazilyPullInlinedDataStream(controller, streamState, inlinedDataReader)
        await pullStream(
          controller,
          queue,
          streamState,
          reactReader,
          getServerInsertedHTML
        )
      } else {
        await eagerlyPullInlinedDataStream(
          controller,
          streamState,
          inlinedDataReader
        )
        return closeCompletedStream(controller, queue, streamState)
      }
    },
  })

  if (devMode) {
    return renderStream.pipeThrough(createRootLayoutValidatorStream())
  } else {
    return renderStream
  }
}

async function clearCurrentMicrotaskQueue(streamState: StreamState) {
  return new Promise<void>((resolve) =>
    scheduleImmediate(() => {
      streamState.taskId++
      resolve()
    })
  )
}

async function startFillingQueue(
  queue: Array<Uint8Array>,
  streamState: StreamState,
  reader: ReadableStreamDefaultReader<Uint8Array>
): Promise<void> {
  return fillQueueUntilNextMacroTask(
    streamState.taskId,
    queue,
    streamState,
    reader
  )
}

async function fillQueueUntilNextMacroTask(
  fillId: number,
  queue: Array<Uint8Array>,
  streamState: StreamState,
  reader: ReadableStreamDefaultReader<Uint8Array>
) {
  const { done, value: chunk } = await streamState.blockedRead

  if (done) {
    streamState.status = StreamStatus.COMPLETE
    return
  }

  if (streamState.taskId !== fillId) {
    return
  }

  queue.push(chunk)
  streamState.blockedRead = reader.read()
  fillQueueUntilNextMacroTask(fillId, queue, streamState, reader)
  return
}

const LESS_THAN_BRACKET_BTYE /*   */ = 60 // '<'
const EXCLAMATION_BYTE /*         */ = 33 // '!'
const D_BYTE /*                   */ = 68 // 'D'

async function pullShell(
  controller: ReadableStreamDefaultController<Uint8Array>,
  queue: Array<Uint8Array>,
  streamState: StreamState,
  reader: ReadableStreamDefaultReader<Uint8Array>,
  getServerInsertedHTML: () => Promise<string>
) {
  // We await here because it returns after resolving the FIRST chunk
  await startFillingQueue(queue, streamState, reader)

  // We start generating server HTML right afte receiving the first chunk
  // in the current task because we only want it to include server HTML derived from
  // the work React already has done. If we wait until the next task it might pick
  // up additional server HTML earlier than excepted. This wouldn't be broken but it
  // can increase the size of the server HTML delaying visual content
  const pendingHTML = getServerInsertedHTML()

  await clearCurrentMicrotaskQueue(streamState)

  let i = 0

  const html = await pendingHTML
  // eslint-disable-next-line no-labels
  serverInsertion: if (html) {
    if (queue.length) {
      const firstChunk = queue[0]
      // If the first chunk of the shell contains `<!DOCTYPE html>` as the leading bytes
      // we are actually flushing a shell. If not then we infer we are flushing an
      // incomplete document or a continuation such as in the case of resume when
      // the shell was already flushed.
      // We only check '<!D' because it disambiguates from comment tags.
      if (
        firstChunk.length < 3 ||
        firstChunk[0] !== LESS_THAN_BRACKET_BTYE ||
        firstChunk[1] !== EXCLAMATION_BYTE ||
        firstChunk[2] !== D_BYTE
      ) {
        // We are flushing a continuation or an incomplete/invalid document.
        // We just enqueue the server html first
        controller.enqueue(encoder.encode(html))
        // eslint-disable-next-line no-labels
        break serverInsertion
      }
    }
    for (; i < queue.length - 1; i++) {
      const chunk = queue[i]
      const nextChunk = queue[i + 1]
      const indexOfHeadEndTag = findIndexOfHeadEndTag(chunk, nextChunk)
      if (indexOfHeadEndTag > -1) {
        if (indexOfHeadEndTag < chunk.byteLength / 2) {
          controller.enqueue(chunk.slice(0, indexOfHeadEndTag))
          controller.enqueue(encoder.encode(html))
          controller.enqueue(chunk.subarray(indexOfHeadEndTag))
        } else {
          controller.enqueue(chunk.subarray(0, indexOfHeadEndTag))
          controller.enqueue(encoder.encode(html))
          controller.enqueue(chunk.slice(indexOfHeadEndTag))
        }
        i++
        // eslint-disable-next-line no-labels
        break serverInsertion
      } else {
        controller.enqueue(chunk)
      }
    }
    if (i < queue.length) {
      const chunk = queue[i]
      const indexOfHeadEndTag = findIndexOfHeadEndTag(chunk, null)
      if (indexOfHeadEndTag > -1) {
        let finalChunk
        if (indexOfHeadEndTag < chunk.byteLength / 2) {
          controller.enqueue(chunk.slice(0, indexOfHeadEndTag))
          controller.enqueue(encoder.encode(html))
          finalChunk = chunk.subarray(indexOfHeadEndTag)
        } else {
          controller.enqueue(chunk.subarray(0, indexOfHeadEndTag))
          controller.enqueue(encoder.encode(html))
          finalChunk = chunk.slice(indexOfHeadEndTag)
        }
        enqueueChunkWithoutSuffix(controller, finalChunk, streamState)
      } else {
        controller.enqueue(chunk)
      }
      i++
    }
  }

  for (; i < queue.length - 1; i++) {
    controller.enqueue(queue[i])
  }
  if (i < queue.length) {
    const finalChunk = queue[i]
    // The last chunk is special. It might contain the closing body and html tags
    // which should be withheld until the rest of the stream has finished. React will ensure
    // these are the final bytes of anything it streams so we can simply check the trailing 14 bytes
    // of the last chunk
    enqueueChunkWithoutSuffix(controller, finalChunk, streamState)
  }
  queue.length = 0
}

async function pullStream(
  controller: ReadableStreamDefaultController<Uint8Array>,
  queue: Array<Uint8Array>,
  streamState: StreamState,
  reader: ReadableStreamDefaultReader<Uint8Array>,
  getServerInsertedHTML: () => Promise<string>
) {
  // We await here because it returns after resolving the FIRST chunk
  await startFillingQueue(queue, streamState, reader)

  // We start generating server HTML right afte receiving the first chunk
  // in the current task because we only want it to include server HTML derived from
  // the work React already has done. If we wait until the next task it might pick
  // up additional server HTML earlier than excepted. This wouldn't be broken but it
  // can increase the size of the server HTML delaying visual content
  const pendingHTML = getServerInsertedHTML()

  await clearCurrentMicrotaskQueue(streamState)

  const html = await pendingHTML
  if (html) {
    controller.enqueue(encoder.encode(html))
  }

  let i = 0
  for (; i < queue.length - 1; i++) {
    controller.enqueue(queue[i])
  }
  // eslint-disable-next-line no-labels
  suffixStripping: if (i < queue.length) {
    const finalChunk = queue[i]
    // The last chunk is special. It might contain the closing body and html tags
    // which should be withheld until the rest of the stream has finished. React will ensure
    // these are the final bytes of anything it streams so we can simply check the trailing 14 bytes
    // of the last chunk
    const match = ENCODED_TAGS.CLOSED.BODY_AND_HTML
    const chunkStartIndex = finalChunk.byteLength - match.byteLength

    for (let j = 0; j < match.byteLength; j++) {
      if (match[j] !== finalChunk[j + chunkStartIndex]) {
        controller.enqueue(finalChunk)
        // eslint-disable-next-line no-labels
        break suffixStripping
      }
    }

    streamState.suffix = match.slice()
    controller.enqueue(finalChunk.subarray(0, chunkStartIndex))
  }
  queue.length = 0
}

async function closeCompletedStream(
  controller: ReadableStreamDefaultController<Uint8Array>,
  queue: Array<Uint8Array>,
  streamState: StreamState
) {
  if (queue.length) {
    throw new Error('INVARIANT: queue should be empty when stream is complete')
  }
  if (streamState.suffix) {
    controller.enqueue(streamState.suffix)
  }
  controller.close()
}

function findIndexOfHeadEndTag(
  thisChunk: Uint8Array,
  nextChunk: null | Uint8Array
): number {
  const match = ENCODED_TAGS.CLOSED.HEAD
  const iterationLength = thisChunk.byteLength - match.byteLength

  let i = 0
  for (; i <= iterationLength; i++) {
    let completeMatch = true
    // from index `i`, iterate through `b` and check for mismatch
    for (let j = 0; j < match.length; j++) {
      // if the values do not match, then this isn't a complete match, exit `b` iteration early and iterate to next index of `a`.
      if (thisChunk[i + j] !== match[j]) {
        completeMatch = false
        break
      }
    }

    if (completeMatch) {
      return i
    }
  }

  if (nextChunk) {
    for (; i < thisChunk.byteLength; i++) {
      let completeMatch = true

      for (let j = 0; j < match.length; j++) {
        if (i + j >= thisChunk.byteLength) {
          const offset = i + j - thisChunk.byteLength
          if (nextChunk[offset] !== match[j]) {
            completeMatch = false
            break
          }
        } else if (thisChunk[i + j] !== match[j]) {
          completeMatch = false
          break
        }
      }

      if (completeMatch) {
        return i
      }
    }
  }

  return -1
}

async function lazilyPullInlinedDataStream(
  controller: ReadableStreamDefaultController<Uint8Array>,
  streamState: StreamState,
  reader: ReadableStreamDefaultReader<Uint8Array>
) {
  const currentTaskId = streamState.taskId

  if (streamState.blockedInlinedDataRead === null) {
    streamState.blockedInlinedDataRead = reader.read()
  }

  while (streamState.blockedInlinedDataRead) {
    const { done, value: chunk } = await streamState.blockedInlinedDataRead

    if (streamState.taskId !== currentTaskId) {
      return
    }

    if (done) {
      return
    }

    // Wait for another macrotask. If the taskId increments we know there
    // was higher priority work to flush and we terminate
    await new Promise<void>((resolve) => scheduleImmediate(() => resolve()))

    if (streamState.taskId !== currentTaskId) {
      return
    }

    controller.enqueue(chunk)
    streamState.blockedInlinedDataRead = reader.read()
  }
}

async function eagerlyPullInlinedDataStream(
  controller: ReadableStreamDefaultController<Uint8Array>,
  streamState: StreamState,
  reader: ReadableStreamDefaultReader<Uint8Array>
) {
  let nextRead = streamState.blockedInlinedDataRead || reader.read()

  while (true) {
    const { done, value: chunk } = await nextRead
    if (done) {
      return
    }
    controller.enqueue(chunk)
    nextRead = reader.read()
  }
}

function enqueueChunkWithoutSuffix(
  controller: ReadableStreamDefaultController,
  finalChunk: Uint8Array,
  streamState: StreamState
) {
  const match = ENCODED_TAGS.CLOSED.BODY_AND_HTML
  const chunkStartIndex = finalChunk.byteLength - match.byteLength

  for (let j = 0; j < match.byteLength; j++) {
    if (match[j] !== finalChunk[j + chunkStartIndex]) {
      controller.enqueue(finalChunk)
      return
    }
  }

  streamState.suffix = match.slice()
  controller.enqueue(finalChunk.subarray(0, chunkStartIndex))
}

/*
 * Checks if the root layout is missing the html or body tags
 * and if so, it will inject a script tag to throw an error in the browser, showing the user
 * the error message in the error overlay.
 */
export function createRootLayoutValidatorStream(): TransformStream<
  Uint8Array,
  Uint8Array
> {
  let foundHtml = false
  let foundBody = false
  return new TransformStream({
    async transform(chunk, controller) {
      // Peek into the streamed chunk to see if the tags are present.
      if (
        !foundHtml &&
        indexOfUint8Array(chunk, ENCODED_TAGS.OPENING.HTML) > -1
      ) {
        foundHtml = true
      }

      if (
        !foundBody &&
        indexOfUint8Array(chunk, ENCODED_TAGS.OPENING.BODY) > -1
      ) {
        foundBody = true
      }

      controller.enqueue(chunk)
    },
    flush(controller) {
      const missingTags: typeof window.__next_root_layout_missing_tags = []
      if (!foundHtml) missingTags.push('html')
      if (!foundBody) missingTags.push('body')

      if (!missingTags.length) return

      controller.enqueue(
        encoder.encode(
          `<script>self.__next_root_layout_missing_tags=${JSON.stringify(
            missingTags
          )}</script>`
        )
      )
    },
  })
}
