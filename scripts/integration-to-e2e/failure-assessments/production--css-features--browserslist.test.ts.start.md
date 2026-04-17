# browserslist: PRE-EXISTING

## Summary

This failure reveals a pre-existing issue with Turbopack's browserslist processing. The test expects different CSS media query outputs for "old" vs "new" browser targets, but both configurations are producing identical output (`@media (min-resolution:2x)`), suggesting Turbopack is not properly respecting browserslist configurations when processing CSS media queries.

## Evidence

**Identical behavior across different browserlists:**

- "browsers-old" fixture targets `["ie 11", "safari 4", "chrome 28"]` but outputs `@media (min-resolution:2x)`
- "browsers-new" fixture targets `["last 1 chrome version"]` and outputs `@media (min-resolution:2x)`
- Both should produce different outputs - old browsers typically need vendor prefixes like `-webkit-min-device-pixel-ratio:2`

**Original test snapshots match converted test:**

- Original integration test at `test/integration/css-features/test/browserslist.test.ts` has identical snapshots
- The conversion accurately copied the expectations from the original test
- Both tests have the same CSS input: `@media (min-resolution: 2dppx)`

**Expected vs actual output:**

- Expected (snapshot): `@media (-webkit-min-device-pixel-ratio:2),(min-resolution:2dppx)`
- Actual (test run): `@media (min-resolution:2x)`
- The actual output matches what the "New" test expects, not the "Old" test

## Fix suggestion

This appears to be a framework issue where Turbopack's CSS processing is not properly differentiating between browserslist configurations. The original integration test likely had the same issue but went unnoticed. Investigation needed into Turbopack's autoprefixing and media query transformation logic to ensure it properly respects browserslist settings when targeting different browser versions.
