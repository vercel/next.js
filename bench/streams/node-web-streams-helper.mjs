import {
  createBufferedTransformStream,
  createHeadInsertionTransformStream,
} from '../../packages/next/dist/server/stream-utils/node-web-streams-helper.js'
import fs from 'fs'
import stream from 'stream'

async function b1() {
  // warmup
  bench('./100m')

  const files = ['./1m', './10m', './100m'].reverse()
  const results = []

  for (const file of files) {
    results.push(await bench(file))

    performance.clearMarks()
    performance.clearMeasures()
  }

  console.table(results)

  async function bench(file) {
    performance.mark('wall-start')

    performance.mark('instantiate-start')
    const bufferedTransformStream = createBufferedTransformStream()
    performance.mark('instantiate-end')

    const readable = fs.createReadStream(file)
    const input = stream.Readable.toWeb(readable)

    const noopWritable = new WritableStream({
      write(chunk) {},
    })

    performance.mark('transform-start')
    await input.pipeThrough(bufferedTransformStream).pipeTo(noopWritable)
    performance.mark('transform-end')

    performance.mark('wall-end')

    return {
      name: file,
      wall: performance.measure('wall', 'wall-start', 'wall-end').duration,
      instantiate: performance.measure(
        'instantiate',
        'instantiate-start',
        'instantiate-end'
      ).duration,
      transform: performance.measure(
        'transform',
        'transform-start',
        'transform-end'
      ).duration,
    }
  }
}

async function b2() {
  performance.mark('wall-start')

  performance.mark('instantiate-start')
  const headInsertionTransformStream = createHeadInsertionTransformStream(() =>
    Promise.resolve('foo')
  )
  performance.mark('instantiate-end')

  performance.mark('setup-start')
  const readable = fs.createReadStream('./vercel.html')
  const input = stream.Readable.toWeb(readable)

  const noopWritable = new WritableStream({
    write(chunk) {},
  })
  performance.mark('setup-end')

  performance.mark('transform-start')
  await input
    .pipeThrough(createBufferedTransformStream())
    .pipeThrough(headInsertionTransformStream)
    .pipeTo(noopWritable)
  performance.mark('transform-end')

  performance.mark('wall-end')

  return {
    name: 'bench - createHeadInsertionTransformStream',
    wall: performance.measure('wall', 'wall-start', 'wall-end').duration,
    setup: performance.measure('setup', 'setup-start', 'setup-end').duration,
    instantiate: performance.measure(
      'instantiate',
      'instantiate-start',
      'instantiate-end'
    ).duration,
    transform: performance.measure(
      'transform',
      'transform-start',
      'transform-end'
    ).duration,
  }
}

await b1()

const r = await b2()
console.log(r)
