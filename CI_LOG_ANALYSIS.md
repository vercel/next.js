# CI Log Analysis: Turbopack Integration Test Failures

## Executive Summary

Analysis of 6 failing CI jobs reveals a consistent pattern: **test helper functions are returning objects instead of strings**, causing `toMatch()` and `toBe()` assertions to fail.

All failures occurred after changes replacing `check()` with `retry()` in E2E tests. The root cause appears to be async/await handling differences between the two functions.

---

## Failing Tests Grouped by Test File

### 1. test/integration/prerender/test/index.test.ts

**TEST NAME:** SSG Prerender › development mode getStaticPaths › should not cache getStaticPaths errors
**TEST FILE:** /test/integration/prerender/test/index.test.ts:51-56
**ASSERTION TYPE:** toMatch()

**CODE:**

```javascript
await retry(
  () => {
    expect(renderViaHTTP(appPort, '/blog/post-1')).toMatch(/post-1/)
  },
  30000,
  1000
)
```

**EXPECTED:** String containing "post-1"
**RECEIVED:** Empty object `{}`
**CATEGORY:** assertion | api-response-handling
**ROOT CAUSE:** `renderViaHTTP()` returning object instead of HTML response string (not being awaited or returning wrong type)

---

### 2. test/integration/typescript-hmr/test/index.test.ts

**TEST NAME:** TypeScript HMR › delete a page and add it back › should detect the changes to typescript pages and display it
**TEST FILE:** /test/integration/typescript-hmr/test/index.test.ts:38-43
**ASSERTION TYPE:** toMatch()

**CODE:**

```javascript
await retry(
  () => {
    expect(getBrowserBodyText(browser)).toMatch(/Hello World/)
  },
  30000,
  1000
)
```

**EXPECTED:** String matching `/Hello World/`
**RECEIVED:** Playwright browser object:

```json
{
  "activeTrace": "http%3A%2F%2Flocalhost%3A35263%2Fhello",
  "eventCallbacks": {"request": Set {}, "response": Set {}},
  "Symbol(Symbol.toStringTag)": "Playwright"
}
```

**CATEGORY:** assertion | browser-text-extraction
**ROOT CAUSE:** `getBrowserBodyText()` passed browser object directly instead of extracting/returning text content

---

### 3. test/integration/read-only-source-hmr/test/index.test.ts

**TEST NAME:** Read-only source HMR › (3 tests):

- should detect changes to a page
- should handle page deletion and subsequent recreation
- should detect a new page

**TEST FILE:** /test/integration/read-only-source-hmr/test/index.test.ts:63-157
**ASSERTION TYPE:** toMatch()

**CODE PATTERN:**

```javascript
await retry(
  () => {
    expect(getBrowserBodyText(browser)).toMatch(/Hello World|New page/)
  },
  30000,
  1000
)
```

**ASSERTION LOCATIONS:** Lines 65, 110, 156
**EXPECTED:** String matching patterns `/Hello World/` or `/New page/`
**RECEIVED:** Playwright browser object (identical to #2)
**CATEGORY:** assertion | browser-text-extraction
**ROOT CAUSE:** Same as #2 - `getBrowserBodyText()` helper not functioning correctly

---

### 4. test/integration/i18n-support-base-path/test/shared.ts

**TEST NAME:** i18n Support basePath › production mode › should navigate through history with query correctly
**TEST FILE:** /test/integration/i18n-support-base-path/test/shared.ts:548-553
**ASSERTION TYPE:** toBe()

**CODE:**

```javascript
await retry(
  () => {
    expect(browser.elementByCss('#router-locale').text()).toBe('nl')
  },
  30000,
  1000
)
```

**EXPECTED:** String `"nl"`
**RECEIVED:** Playwright browser object:

```json
{
  "activeTrace": undefined,
  "eventCallbacks": {"request": Set {}, "response": Set {}},
  "Symbol(Symbol.toStringTag)": "Playwright"
}
```

**CATEGORY:** assertion | element-text-extraction
**ROOT CAUSE:** `.text()` method not awaited or not returning string value - element selector chain returns browser object instead of text content

---

### 5. test/integration/i18n-support/test/shared.ts

**TEST NAME:** i18n Support › production mode › should navigate through history with query correctly
**TEST FILE:** /test/integration/i18n-support/test/shared.ts:548-553
**ASSERTION TYPE:** toBe()
**EXPECTED:** String `"nl"`
**RECEIVED:** Playwright browser object (identical to #4)
**CATEGORY:** assertion | element-text-extraction
**ROOT CAUSE:** Identical to #4

---

### 6. test/integration/next-image-legacy/default/test/index.test.ts

**TEST NAME:** Image Component Tests › production mode › (2 tests):

- should apply filter style after image loads
- should emit image for next/dynamic with non ssr case

**TEST FILE:** /test/integration/next-image-legacy/default/test/index.test.ts:1418-1423
**ASSERTION TYPE:** toMatch()

**CODE:**

```javascript
await retry(
  () => {
    expect(getSrc(browser, 'img-plain')).toMatch(/^\/_next\/image/)
  },
  30000,
  1000
)
```

**ASSERTION LOCATION:** Line 1420
**EXPECTED:** String matching `/^\/_next\/image/`
**RECEIVED:** Node.js async handle object:

```json
{
  "Symbol(async_id_symbol)": 261543,
  "Symbol(trigger_async_id_symbol)": 260336,
  "Symbol(kResourceStore)": undefined
}
```

**CATEGORY:** assertion | image-src-extraction
**ROOT CAUSE:** `getSrc()` returning async handle instead of actual image URL string

---

### 7. test/integration/next-image-new/app-dir/test/index.test.ts

**TEST NAME:** Image Component Default Tests › production mode › (2 tests):

- should apply filter style after image loads
- should emit image for next/dynamic with non ssr case

**TEST FILE:** /test/integration/next-image-new/app-dir/test/index.test.ts:1761-1766
**ASSERTION TYPE:** toMatch()
**ASSERTION LOCATION:** Line 1763
**EXPECTED:** String matching `/^\/_next\/image/`
**RECEIVED:** Node.js async handle object (identical to #6)
**CATEGORY:** assertion | image-src-extraction
**ROOT CAUSE:** Same as #6 - `getSrc()` not returning string value

---

### 8. test/integration/next-image-legacy/no-intersection-observer-fallback/test/index.test.ts

**TEST NAME:** Image Component No IntersectionObserver test › production mode › (2 tests):

- SSR Lazy Loading Tests › should automatically load images if observer does not exist
- Client-side Lazy Loading Tests › should automatically load images if observer does not exist

**TEST FILE:** /test/integration/next-image-legacy/no-intersection-observer-fallback/test/index.test.ts:33-38, 59-64
**ASSERTION TYPE:** toMatch()

**CODE:**

```javascript
await retry(
  async () => {
    expect(await browser.eval('IntersectionObserver')).toMatch(/null/)
  },
  30000,
  1000
)
```

**ASSERTION LOCATIONS:** Lines 35, 61
**EXPECTED:** String matching `/null/` (string representation)
**RECEIVED:** JavaScript `null` value (not a string)
**CATEGORY:** assertion | browser-eval
**ROOT CAUSE:** `browser.eval()` returns JS value (null) instead of string representation, assertion expects string

---

## Pattern Analysis

### Helper Functions Affected

1. **renderViaHTTP(port, path)** - Returns empty object `{}` instead of HTTP response
2. **getBrowserBodyText(browser)** - Returns browser object instead of extracted body text
3. **getSrc(browser, elementId)** - Returns async handle instead of image URL string
4. **browser.elementByCss(selector).text()** - Returns browser object instead of element text
5. **browser.eval(code)** - Returns JS value instead of string representation

### Async/Await Issues

All failures occur inside `retry()` callbacks. The pattern suggests:

```javascript
// Helper functions may need to be:
// 1. Awaited if async
// 2. Have results extracted/stringified
// 3. Handle return types correctly for retry() context

// Current broken pattern:
expect(getBrowserBodyText(browser)).toMatch(/pattern/) // returns wrong type

// Should probably be:
expect(await getBrowserBodyText(browser)).toMatch(/pattern/)
// OR
const text = await getBrowserBodyText(browser)
expect(text).toMatch(/pattern/)
```

### Connection to commit()

Commit `093b567a6db`: "test: replace deprecated check() with retry() in E2E tests"

**Hypothesis:** The `check()` function may have had different callback handling:

- `check()` might auto-await helper returns
- `retry()` may not handle async properly in callbacks
- Tests weren't updated to accommodate `retry()` callback patterns

---

## Summary of Findings

| Aspect                  | Finding                                                             |
| ----------------------- | ------------------------------------------------------------------- |
| **Total Jobs Analyzed** | 6                                                                   |
| **Failing Tests**       | 14+ unique test cases                                               |
| **Test Files Affected** | 8 files                                                             |
| **Root Issue**          | Helper functions returning wrong types (objects instead of strings) |
| **Assertion Types**     | `toMatch()` and `toBe()`                                            |
| **Common Factor**       | All use `retry()` instead of deprecated `check()`                   |
| **Likely Cause**        | Async/await handling change from `check()` to `retry()`             |

---

## Affected Test Categories

- SSG/Pre-rendering (1 file)
- HMR/Hot Module Reload (2 files)
- i18n/Internationalization (2 files)
- Image Component (3 files)
- Browser Testing Infrastructure

---

## Recommended Investigation Path

1. **Compare implementations:**
   - `test/lib/next-test-utils.ts` - Find `check()` vs `retry()` functions
   - Note async handling differences

2. **Examine helper functions:**
   - `test/lib/next-webdriver.ts` - Browser helper implementations
   - Check if they expect to be awaited

3. **Review callback patterns:**
   - Test files using `retry()` callbacks
   - Identify if callbacks need `await` or refactoring

4. **Fix strategy:**
   - Option A: Modify `retry()` to handle async callbacks like `check()` did
   - Option B: Update test callbacks to properly await helper results
   - Option C: Modify helper functions to return strings directly
