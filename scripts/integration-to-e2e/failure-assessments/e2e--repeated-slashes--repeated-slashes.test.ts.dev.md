# repeated-slashes: PRE-EXISTING

## Summary

The test failure is caused by a pre-existing behavioral change in Next.js regarding how it handles malformed URLs with repeated slashes. The framework no longer issues 308 permanent redirects for URLs like `//google.com`, `/\google.com`, and `/\\/google.com` in development mode, instead serving them with 200 status codes. The test conversion itself is correct and faithful to the original integration test.

## Evidence

- **Consistent redirect failure pattern**: All failing tests expect status 308 (permanent redirect) but receive status 200, while tests expecting 404 or client-side behavior pass correctly
- **Identical test logic**: The converted e2e test preserves the exact same assertions and test flow as the original integration test
- **Same configuration**: Both original and converted tests use identical `next.config.js` files with the same redirect rules
- **Same fixtures**: All fixture files are present and identical between original and converted versions
- **Behavioral change scope**: Only server-side redirect behavior fails; client-side routing, 404 responses, and other behaviors work as expected

## Fix suggestion

This is a framework behavior change that affects how Next.js handles malformed URLs with repeated or mixed slashes. The original integration test would likely also fail if run on this branch. This should be investigated as a potential regression in Next.js URL handling, or the test expectations should be updated to match the new framework behavior if this change was intentional.
