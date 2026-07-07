import { nextTestSetup } from 'e2e-utils'
import { createNowRouteMatches, retry } from 'next-test-utils'
import zlib from 'node:zlib'

const MATCHED_PATH = '/dynamic/[slug]'
const PARSE_ERROR = 'Failed to parse postponed state'

// A real deflate stream (base64) of a representative resume-data-cache payload.
// Slicing this produces the truncated/corrupt tails used by the cases below.
function validResumeDataCacheTail(): string {
  return zlib
    .deflateSync(
      JSON.stringify({
        store: { cache: {}, fetch: { a: 1 }, encryptedBoundArgs: {} },
      })
    )
    .toString('base64')
}

// These tests exercise the real minimal-mode resume path: the body of a
// `next-resume` POST is read in base-server and handed to
// `parsePostponedState`. A malformed body fails to parse, and the framework
// degrades to a dynamic render (status 200). The assertions verify that the
// failure is logged with content-free structural diagnostics that identify
// *how* the state was malformed, so the otherwise-opaque error is actionable in
// production.
describe('postponed resume - parse failure diagnostics', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    // Synthesizes the minimal-mode resume path locally; does not exercise the
    // deployed platform proxy.
    skipDeployment: true,
    env: {
      NEXT_PRIVATE_TEST_HEADERS: '1',
      NEXT_PRIVATE_MINIMAL_MODE: '1',
    },
  })

  async function postResume(slug: string, body: string) {
    const outputIndex = next.cliOutput.length
    const response = await next.fetch(`/dynamic/${slug}`, {
      method: 'POST',
      headers: {
        'next-resume': '1',
        'content-type': 'text/plain',
        'x-matched-path': MATCHED_PATH,
        'x-now-route-matches': createNowRouteMatches({ slug }).toString(),
      },
      body,
    })
    return { response, outputIndex }
  }

  it('reports a truncated postponed string (incomplete delivery) as Z_BUF', async () => {
    // Declares a 100-char postponed string but delivers far fewer bytes, so the
    // postponed string itself is short and the resume-data-cache tail is empty.
    const { response, outputIndex } = await postResume('a', '100:short')

    expect(response.status).toBe(200)
    expect(await response.text()).toContain('a')

    await retry(async () => {
      const cliOutput = next.cliOutput.slice(outputIndex)
      expect(cliOutput).toContain(PARSE_ERROR)
      expect(cliOutput).toContain('postponedStringComplete: false')
      expect(cliOutput).toContain('Z_BUF_ERROR')
    })
  })

  it('reports a truncated resume-data-cache tail (complete string) as Z_BUF', async () => {
    const tail = validResumeDataCacheTail()
    const truncatedTail = tail.slice(0, tail.length - 12)
    const { response, outputIndex } = await postResume(
      'b',
      `1:x${truncatedTail}`
    )

    expect(response.status).toBe(200)

    await retry(async () => {
      const cliOutput = next.cliOutput.slice(outputIndex)
      expect(cliOutput).toContain(PARSE_ERROR)
      expect(cliOutput).toContain('postponedStringComplete: true')
      expect(cliOutput).toContain('Z_BUF_ERROR')
    })
  })

  it('reports a corrupt resume-data-cache tail as Z_DATA (a real bug to surface)', async () => {
    const tail = validResumeDataCacheTail()
    // Dropping the leading bytes corrupts the deflate header, which is a
    // content corruption rather than a short read.
    const corruptTail = tail.slice(6)
    const { response, outputIndex } = await postResume('c', `1:x${corruptTail}`)

    expect(response.status).toBe(200)

    await retry(async () => {
      const cliOutput = next.cliOutput.slice(outputIndex)
      expect(cliOutput).toContain(PARSE_ERROR)
      expect(cliOutput).toContain('Z_DATA_ERROR')
    })
  })

  it('reports a body with no length prefix', async () => {
    const { response, outputIndex } = await postResume(
      'd',
      'not-a-postponed-state'
    )

    expect(response.status).toBe(200)

    await retry(async () => {
      const cliOutput = next.cliOutput.slice(outputIndex)
      expect(cliOutput).toContain(PARSE_ERROR)
      expect(cliOutput).toContain('hasLengthPrefix: false')
    })
  })

  it('does not leak the postponed-state content into the log', async () => {
    // A complete postponed string that is invalid JSON, carrying a sentinel.
    // The RDC tail is `null` (empty cache), so parsing reaches the JSON decode
    // of the postponed string and fails there.
    const marker = 'SENSITIVE_DO_NOT_LOG'
    const { response, outputIndex } = await postResume(
      'e',
      `${marker.length}:${marker}null`
    )

    expect(response.status).toBe(200)

    await retry(async () => {
      const cliOutput = next.cliOutput.slice(outputIndex)
      expect(cliOutput).toContain(PARSE_ERROR)
      expect(cliOutput).toContain('hasLengthPrefix: true')
    })

    // The diagnostics report sizes and codes only, never the state bytes.
    expect(next.cliOutput.slice(outputIndex)).not.toContain(marker)
  })
})
