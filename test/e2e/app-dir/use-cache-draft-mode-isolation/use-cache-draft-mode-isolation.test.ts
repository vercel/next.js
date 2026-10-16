import { nextTestSetup } from 'e2e-utils'

const DRAFT_CONTENT = 'DRAFT-SECRET'
const PUBLIC_CONTENT = 'PUBLIC'

type FetchContent = (key: string, cookie?: string) => Promise<string>

// Cross-request dedup shares pending cache fills within one server process. In
// deploy mode, concurrent requests could hit different lambdas, so this test
// cannot exercise the sharing.
// @force-gate !deploy
describe('use-cache-draft-mode-isolation', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  async function getDraftModeCookie(): Promise<string> {
    const response = await next.fetch('/enable-draft')
    const setCookie = response.headers.get('set-cookie')

    if (!setCookie) {
      throw new Error('Expected /enable-draft to set a draft mode cookie.')
    }

    return setCookie.split(';')[0]
  }

  // Each test uses a distinct key so that every test gets its own cache entry,
  // independent of what earlier tests populated.
  async function fetchRoute(key: string, cookie?: string): Promise<string> {
    const response = await next.fetch(
      `/route-handler?key=${key}`,
      cookie ? { headers: { cookie } } : undefined
    )
    const body = await response.json()
    return body.content as string
  }

  async function fetchPage(key: string, cookie?: string): Promise<string> {
    const response = await next.fetch(
      `/page?key=${key}`,
      cookie ? { headers: { cookie } } : undefined
    )
    const html = await response.text()
    return html.includes(DRAFT_CONTENT) ? DRAFT_CONTENT : PUBLIC_CONTENT
  }

  // The editor's draft mode request leads, and a public request overlaps the
  // pending fill. The public request must not join the editor's fill, i.e. it
  // must never receive the editor's unpublished content.
  async function expectDraftFillNotSharedWithPublicRequest(
    fetchContent: FetchContent,
    key: string
  ): Promise<void> {
    const draftCookie = await getDraftModeCookie()

    // The cached function takes 3s, so the 500ms offset lands the public
    // request well inside the editor's pending window.
    const editorPromise = fetchContent(key, draftCookie)
    await new Promise((resolve) => setTimeout(resolve, 500))
    const publicContent = await fetchContent(key)
    const editorContent = await editorPromise

    // Sanity check: the editor must see draft content, otherwise the test
    // itself is broken (e.g. draft mode not readable in "use cache").
    expect(editorContent).toBe(DRAFT_CONTENT)
    expect(publicContent).toBe(PUBLIC_CONTENT)
  }

  // The public request leads, and the editor's draft mode request overlaps the
  // pending fill. The editor must not join the public fill, i.e. it must
  // produce its own draft content.
  async function expectPublicFillNotSharedWithDraftRequest(
    fetchContent: FetchContent,
    key: string
  ): Promise<void> {
    const draftCookie = await getDraftModeCookie()

    const publicPromise = fetchContent(key)
    await new Promise((resolve) => setTimeout(resolve, 500))
    const editorContent = await fetchContent(key, draftCookie)
    const publicContent = await publicPromise

    expect(publicContent).toBe(PUBLIC_CONTENT)
    expect(editorContent).toBe(DRAFT_CONTENT)
  }

  it('does not expose a pending draft fill to a concurrent public request', async () => {
    await expectDraftFillNotSharedWithPublicRequest(fetchRoute, 'route-cold')
  })

  it('does not expose a pending draft fill to a concurrent public request despite a fresh public entry', async () => {
    const key = 'route-warm'

    // Populate the public entry first. The cross-request pending map is
    // consulted before the memory cache, so a fresh public entry cannot be what
    // protects the public request.
    expect(await fetchRoute(key)).toBe(PUBLIC_CONTENT)

    await expectDraftFillNotSharedWithPublicRequest(fetchRoute, key)
  })

  it('does not serve a pending public fill to a concurrent draft mode request', async () => {
    await expectPublicFillNotSharedWithDraftRequest(fetchRoute, 'route-reverse')
  })

  it('page: does not expose a pending draft fill to a concurrent public request', async () => {
    await expectDraftFillNotSharedWithPublicRequest(fetchPage, 'page-cold')
  })

  it('page: does not serve a pending public fill to a concurrent draft mode request', async () => {
    await expectPublicFillNotSharedWithDraftRequest(fetchPage, 'page-reverse')
  })
})
