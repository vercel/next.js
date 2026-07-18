import { nextTestSetup } from 'e2e-utils'
import {
  openRedbox,
  getRedboxCallStack,
  getRedboxSource,
} from '../../../lib/next-test-utils'

// Bug witness for the "throw site vs mount site" call-stack gap.
//
// A runtime data access lives in a leaf component (the *throw site*,
// `dynamic-breadcrumb.tsx`), mounted by a parent (the *mount site*,
// `app-sidebar.tsx`). The `<Suspense>` fix has to go around the mount site —
// wrapping the throw site itself does nothing, because Suspense must be above
// the suspending component.
//
// The dev overlay already surfaces both frames in the Call Stack, and the code
// frame correctly points at the throw site. What's missing is any labelling
// that tells the reader which frame is the throw site and which is the mount
// site (where the `<Suspense>` edit belongs). So a reader/agent following
// "wrap the data access in <Suspense>" edits the throw site and the error
// persists.
//
// See reproductions/cases/mounting-call-site-not-in-stack.
describe('instant validation - mount-site labelling', () => {
  const { next, skipped, isNextDev } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    env: {
      NEXT_TEST_LOG_VALIDATION: '1',
    },
  })
  if (skipped) return
  if (!isNextDev) {
    // The call-stack labelling is a dev-overlay concern only.
    it('dev-only', () => {})
    return
  }

  const ROUTE = '/suspense-in-root/static/mount-site-not-labelled'

  it('code frame points at the throw site (correct — must not be repointed)', async () => {
    const browser = await next.browser(ROUTE)
    await openRedbox(browser)
    const source = await getRedboxSource(browser)
    // The throw site is the correct code-frame target. The fix for the gap
    // below is to label the mount frame, NOT to move this caret.
    expect(source).toContain('dynamic-breadcrumb.tsx')
    expect(source).toContain('await cookies()')
  })

  it('call stack contains both the throw site and the mount site', async () => {
    const browser = await next.browser(ROUTE)
    await openRedbox(browser)
    const stack = (await getRedboxCallStack(browser)) ?? []
    const joined = stack.join('\n')
    // The data is already there — the mount site is not "missing" from the stack.
    expect(joined).toContain('dynamic-breadcrumb.tsx') // throw site
    expect(joined).toContain('app-sidebar.tsx') // mount site
  })

  // The gap: today both frames render identically (`Name file (line:col)`), with
  // nothing marking which is the throw site and which is the mount site where
  // the `<Suspense>` boundary goes. This asserts the desired distinction; it
  // fails today, so it's `it.failing`. When the overlay labels the frames,
  // this flips — change `it.failing` to `it` (and tighten the matcher to the
  // exact label wording that ships).
  it.failing(
    'call stack labels the mount site distinctly from the throw site',
    async () => {
      const browser = await next.browser(ROUTE)
      await openRedbox(browser)
      const stack = (await getRedboxCallStack(browser)) ?? []
      const hasMountLabel = stack.some((frame) =>
        /mounted by|mount site|suspending component|wrap (in )?<?suspense|<suspense>/i.test(
          frame
        )
      )
      expect(hasMountLabel).toBe(true)
    }
  )
})
