# basic-global-support: CONVERSION-BUG

## Summary

The test failure is caused by missing fixture files. The converted test references fixture directories under `test/production/css-features/fixtures/` but these fixture files were never copied from the original integration test location at `test/integration/css-fixtures/`. This causes the Next.js build to fail because the test app cannot find essential files like pages and CSS files.

## Evidence

1. **Missing fixtures**: The converted test looks for fixtures in `join(__dirname, 'fixtures', 'single-global')` and similar paths, but running `glob` shows no `single-global*` or `url-global*` fixtures exist in `test/production/css-features/fixtures/`.

2. **Original fixtures exist**: All required fixtures exist in the original location at `test/integration/css-fixtures/`, including:
   - `single-global`
   - `single-global-special-characters`
   - `single-global-src`
   - `multi-global`
   - `nested-global`
   - `multi-global-reversed`
   - `url-global`
   - `url-global-asset-prefix-1`
   - `url-global-asset-prefix-2`

3. **Build failure**: The error output shows `ELIFECYCLE Command failed with exit code 1.` during `pnpm next build`, which indicates the Next.js build process failed due to missing source files.

4. **Test structure mismatch**: The original test uses `const fixturesDir = join(__dirname, '../..', 'css-fixtures')` while the converted test uses `join(__dirname, 'fixtures', 'single-global')`, indicating a path conversion error.

## Fix suggestion

Copy all missing fixture directories from `test/integration/css-fixtures/` to `test/production/css-features/fixtures/`. The required fixtures are:

- `single-global`
- `single-global-special-characters`
- `single-global-src`
- `url-global`
- `url-global-asset-prefix-1`
- `url-global-asset-prefix-2`

The fixtures `multi-global`, `nested-global`, and `multi-global-reversed` already exist in the target location.
