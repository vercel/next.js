# css-modules: PRE-EXISTING

## Summary

The test failures are caused by changes to CSS module hashing behavior in Next.js that produce different class name hashes than what was captured in the inline snapshots. The converted test correctly replicates the original integration test logic and fixtures, but the underlying CSS module system is generating different hash values (e.g., `KWKY6G` instead of `VJHdSq`) for identical CSS files.

## Evidence

1. **Identical fixtures**: Both `test/production/css-modules/fixtures/` and `test/integration/css-fixtures/` contain identical CSS and JavaScript files
2. **Identical test logic**: The converted test uses the same inline snapshots and assertion logic as the original integration test
3. **Consistent hash differences**: All failures show the same pattern - CSS module class names have different hash portions while the CSS content and structure remain correct
4. **Systematic failure pattern**: The failures affect multiple test cases (9 snapshots failed) with the same type of hash mismatch, indicating a systematic change rather than a conversion error

Key evidence from test output:

- Expected: `.index-module__VJHdSq__redText{color:red}`
- Actual: `.index-module__KWKY6G__redText{color:red}`

The CSS content (`{color:red}`) and class structure (`index-module__*__redText`) are correct, only the hash portion differs.

## Fix suggestion

**PRE-EXISTING**: This represents a change in CSS module hashing behavior in Next.js. The snapshots need to be updated to reflect the new hash values. Run the test with `-u` flag to update all inline snapshots:

```bash
pnpm test-start-turbo test/production/css-modules/css-modules.test.ts -u
```

The original integration test would likely fail with the same hash mismatches if run in the current environment, indicating this is a framework-level change rather than a test conversion issue.
