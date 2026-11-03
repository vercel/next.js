import { once } from 'node:events'
import { PassThrough, Readable } from 'node:stream'
import { runInNewContext } from 'node:vm'
import { load } from 'cheerio'
import { createNodeInlinedDataStream } from 'next/dist/server/app-render/stream-ops.node'

async function collect(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    expect(Buffer.isBuffer(chunk)).toBe(true)
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

function decodeScripts(html: Buffer): Array<[number, string?]> {
  const self = { __next_f: [] as Array<[number, string?]> }
  const scripts = html.toString().matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)
  for (const script of scripts) {
    runInNewContext(script[1], { self })
  }
  return self.__next_f
}

function decodePayloads(
  html: Buffer,
  externalBrowserRuntime: boolean
): Array<[number, string?]> {
  if (!externalBrowserRuntime) {
    return decodeScripts(html)
  }

  const $ = load(html.toString())
  expect($('script')).toHaveLength(0)
  expect(html.toString()).not.toContain('<script')
  const payloads: Array<[number, string?]> = []
  $('template[data-next-flight]').each((_, template) => {
    payloads.push(JSON.parse($(template).attr('data-next-flight')!))
  })
  return payloads
}

describe('Node inline Flight data', () => {
  describe.each([false, true])(
    'externalBrowserRuntime: %s',
    (externalBrowserRuntime) => {
      // E2E tests exercise real Flight rendering and hydration. These inputs force
      // chunk boundaries that a real server cannot reliably produce on demand.
      it.each([
        {
          name: 'UTF-8 split between adjacent byte chunks',
          chunks: [
            Buffer.from([0xf0, 0x9f]),
            Buffer.from([0x98, 0x80]),
            'tail',
          ],
        },
        {
          name: 'an invalid UTF-8 view with a nonzero byte offset',
          chunks: [
            'head',
            new Uint8Array([17, 0, 255, 128, 18]).subarray(1, 4),
            'tail',
          ],
        },
        {
          name: 'BOMs in both text and byte chunks',
          chunks: ['\ufefftext', Buffer.from('\ufeffbytes')],
        },
        {
          name: 'script delimiters and escapes split between text chunks',
          chunks: [
            '<',
            '/script',
            '>&',
            '\\',
            'u2028',
            '\u2028\u2029',
            '"',
            '\n',
          ],
        },
        {
          name: 'attribute delimiters and entities',
          chunks: [
            '"\'&quot;&amp;',
            '</template><script>alert("flight")</script>',
          ],
        },
      ])('preserves the bytes of $name', async ({ chunks }) => {
        const source = new PassThrough({ objectMode: true })
        for (const chunk of chunks) source.write(chunk)
        source.end()

        const html = await collect(
          createNodeInlinedDataStream(
            source,
            undefined,
            null,
            externalBrowserRuntime
          ) as Readable
        )
        const received = Buffer.concat(
          decodePayloads(html, externalBrowserRuntime)
            .filter(([tag]) => tag === 1 || tag === 3)
            .map(([tag, value]) =>
              Buffer.from(value!, tag === 1 ? 'utf8' : 'base64')
            )
        )
        const expected = Buffer.concat(
          chunks.map((chunk) =>
            typeof chunk === 'string' ? Buffer.from(chunk) : chunk
          )
        )
        expect(received).toEqual(expected)
      })

      it.each([
        null,
        false,
        0,
        '',
        { value: '"\'&quot;&</template></script>\ufeff😀' },
      ])('preserves bootstrap and form state %j', async (formState) => {
        const source = new PassThrough({ objectMode: true })
        source.end()
        const html = await collect(
          createNodeInlinedDataStream(
            source,
            'a"é',
            formState,
            externalBrowserRuntime
          ) as Readable
        )
        expect(decodePayloads(html, externalBrowserRuntime)).toEqual(
          formState === null ? [[0]] : [[0], [2, formState]]
        )
      })

      it('keeps UTF-8 split across separate availability batches as binary', async () => {
        const source = new PassThrough({ objectMode: true })
        const html = createNodeInlinedDataStream(
          source,
          undefined,
          null,
          externalBrowserRuntime
        ) as Readable
        const output: Buffer[] = []
        html.on('data', (chunk) => output.push(chunk))
        await once(html, 'data')
        for (const bytes of [
          Buffer.from([0xf0, 0x9f]),
          Buffer.from([0x98, 0x80]),
        ]) {
          const data = once(html, 'data')
          source.write(bytes)
          await data
        }
        const end = once(html, 'end')
        source.end()
        await end
        expect(
          decodePayloads(Buffer.concat(output), externalBrowserRuntime)
        ).toEqual([[0], [3, '8J8='], [3, 'mIA=']])
      })
    }
  )

  it.each([0, 8192, 128 * 1024])(
    'preserves the complete script bytes for a batch with a %i-character fragment',
    async (length) => {
      const source = new PassThrough({ objectMode: true })
      const text = 'a'.repeat(length)
      for (const chunk of [
        '<head>&\n"',
        text,
        Buffer.from([0xc3]),
        Buffer.from([0xa9]),
        '\\tail😀',
        '',
      ]) {
        source.write(chunk)
      }
      source.end()

      const html = await collect(
        createNodeInlinedDataStream(source, 'a"é', '<&>') as Readable
      )
      const start = '<script nonce="a&quot;é">'
      expect(html).toEqual(
        Buffer.from(
          `${start}(self.__next_f=self.__next_f||[]).push([0]);self.__next_f.push([2,"\\u003c\\u0026\\u003e"])</script>` +
            `${start}self.__next_f.push([1,"\\u003chead\\u003e\\u0026\\n\\"${text}é\\\\tail😀"])</script>`
        )
      )
    }
  )

  it.each([0, 8192, 128 * 1024])(
    'preserves template payloads for a batch with a %i-character fragment',
    async (length) => {
      const source = new PassThrough({ objectMode: true })
      const text = 'a'.repeat(length)
      for (const chunk of [
        '<head>&\n"',
        text,
        Buffer.from([0xc3]),
        Buffer.from([0xa9]),
        '\\tail😀',
        '',
      ]) {
        source.write(chunk)
      }
      source.end()

      const html = await collect(
        createNodeInlinedDataStream(source, 'a"é', '<&>', true) as Readable
      )
      expect(decodePayloads(html, true)).toEqual([
        [0],
        [2, '<&>'],
        [1, `<head>&\n"${text}é\\tail😀`],
      ])
    }
  )
})
