Add a Playwright regression test for navigating from /store/shoes to /store/hats.

The destination's product name and price should be visible immediately, while live stock loads afterward. The test should catch a regression where the product details wait for live stock, even if the completed page still looks correct.

Put the test in e2e/\*.spec.ts and use the provided Playwright configuration. Keep the application behavior unchanged.
