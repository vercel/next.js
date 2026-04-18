All 40 tests pass.

# e2e--next-image-new--app-dir--app-dir.test.ts.start: FIXED

## Root cause

The `NextStartInstance` auto-sets `NEXT_DEPLOYMENT_ID=test-dpl-id-1234` when running under Turbopack (for skew protection), so all generated image URLs include `&dpl=test-dpl-id-1234`. The converted test correctly applied `${dpl}` to webp/png/wide.png imagesrcset assertions but missed applying it to the two `test.tiff` imagesrcset assertions (in `should preload priority images` and `should work with preload prop`). Those `entries.find(...)` lookups returned `undefined` because the rendered `imagesrcset` values did include the dpl query parameter.

## Fix applied

- `test/e2e/next-image-new/app-dir/app-dir.test.ts`: Added `${dpl}` to the two `test.tiff` `imagesrcset` match expressions and their expected values (lines in the priority and preload tests), matching the pattern already used for the other image entries.

## Verification

Ran the specified command. Result: 40 passed, 0 failed (previously: 2 failed, 38 passed). Both previously-failing tests (`should preload priority images`, `should work with preload prop`) now pass.
