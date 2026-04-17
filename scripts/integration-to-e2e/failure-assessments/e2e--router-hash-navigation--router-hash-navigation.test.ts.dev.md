# router-hash-navigation: PRE-EXISTING

## Summary

This test failure is caused by a React hook error in Next.js framework internals that prevents proper page rendering and hydration. The error "Cannot read properties of null (reading 'useInsertionEffect')" originates from the Next.js dev overlay setup, causing the page to fail to render correctly. This prevents the expected scroll behavior when navigating to `/#section`, making the test assertion fail. The test conversion itself is correct with identical logic and properly copied fixtures.

## Evidence

1. **React Hook Error**: The logs show repeated `TypeError: Cannot read properties of null (reading 'useInsertionEffect')` errors originating from Next.js dev overlay code at `next-devtools/userspace/pages/pages-dev-overlay-setup.js:34:20`

2. **Test Logic is Identical**: Comparing the converted test to the original shows identical logic:
   - Both navigate to `/#section`
   - Both expect `window.scrollY` to not be 0 initially
   - Both click `#top-link` and expect scrollY to become 0

3. **Fixtures Are Correct**: The `pages/index.js` file exists in both original and converted locations with identical content, including the necessary elements (`#section`, `#top-link`) and layout that should cause scrolling

4. **Page Load Failure**: The 500 error and hydration failures indicate the page cannot render properly due to the React hook error, preventing the hash-based scroll behavior that the test relies on

5. **Framework-Level Issue**: The error trace shows the problem is in React DOM server rendering and Next.js dev tooling, not in user code or test setup

## Fix suggestion

This appears to be a pre-existing React/Next.js compatibility issue on this branch. The error suggests either a React version mismatch, multiple React instances, or a bug in the Next.js dev overlay system. Investigation should focus on:

1. React version compatibility between Next.js and the React packages
2. Whether multiple React instances are being bundled
3. Recent changes to the Next.js dev overlay or pages router setup that might have introduced this hook calling issue
