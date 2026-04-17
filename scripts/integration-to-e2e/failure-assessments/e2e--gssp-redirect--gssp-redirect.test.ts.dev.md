# gssp-redirect: PRE-EXISTING

## Summary

The failure is caused by a pre-existing framework behavior around browser history management after client-side redirects. The failing tests expect that after navigating to a page that redirects (via GSSP/GSP), calling `window.history.back()` should return to the previous page ("/"), but instead the browser remains at the redirect destination. The converted test logic is identical to the original integration test, indicating this is a framework behavior change rather than a conversion issue.

## Evidence

1. **Identical test logic**: The converted test steps are exactly the same as the original integration test:
   - Start at `/another?mark_as=root`
   - Navigate to `/` via router.push
   - Navigate to redirecting page via router.push
   - Call `window.history.back()`
   - Expect URL to be `/`

2. **Redirects work correctly**: The test output shows redirects are functioning properly with logs like "redirecting { destination: '/another', permanent: false }" and pages loading correctly.

3. **Specific to history behavior**: All 4 failing tests are the "should not replace history" tests, while all other redirect tests (18 of them) pass, indicating redirects themselves work but history management doesn't.

4. **Pattern in failures**: The browser ends up at redirect destinations ("/another", "/gssp-blog/first", "/gsp-blog/first") instead of the expected previous page ("/"), suggesting `window.history.back()` behavior has changed.

## Fix suggestion

This is a PRE-EXISTING framework issue where Next.js client-side navigation to pages with redirects now affects browser history differently than before. The framework may be replacing history entries during redirects instead of preserving them. This would require investigation into Next.js router and redirect handling logic to determine if this is an intentional behavior change or a regression.
