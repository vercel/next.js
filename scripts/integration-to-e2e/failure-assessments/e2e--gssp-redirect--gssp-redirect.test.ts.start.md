# gssp-redirect: PRE-EXISTING

## Summary

This appears to be a pre-existing framework issue with redirect behavior and error handling, not a test conversion problem. The converted test logic is correct and all fixtures are present. The failures suggest that redirect history handling has changed - redirects may now be replacing history entries instead of adding new ones, causing `history.back()` to navigate to redirect destinations rather than the expected previous page. Additionally, the error validation for redirect during prerendering appears to have changed, now throwing a React useContext error instead of the expected validation message.

## Evidence

1. **History navigation failures**: Four tests expect to be at "/" after `history.back()` but end up at redirect destinations ("/another", "/gssp-blog/first", "/gsp-blog/first"). The test pattern is identical between original and converted versions:
   - Navigate from `/another?mark_as=root` → `/` → redirect page → `history.back()`
   - Expected: back at `/`
   - Actual: at redirect destination page

2. **Error message change**: The redirect validation test expects:

   ```
   `redirect` can not be returned from getStaticProps during prerendering
   ```

   But receives:

   ```
   TypeError: Cannot read properties of null (reading 'useContext')
   ```

3. **Conversion is correct**: Comparing original (lines 409-431) vs converted (lines 326-346), the test logic is identical. The converted version properly uses `next.browser()`, `retry()`, and other e2e patterns.

4. **Fixtures exist**: All required pages are present in `test/e2e/gssp-redirect/pages/` and match the original integration test fixtures.

## Fix suggestion

This is a **PRE-EXISTING** framework issue. The redirect behavior appears to have changed such that:

1. Server-side redirects during client-side navigation may be affecting browser history differently than before
2. The error handling/validation for redirects during prerendering has changed, possibly due to React-related changes

Investigation should focus on recent changes to redirect handling in the Next.js router and the getStaticProps validation logic, particularly around prerendering error handling.
