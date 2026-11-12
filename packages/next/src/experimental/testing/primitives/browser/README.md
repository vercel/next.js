# Browser DOM primitives

The locator parser, selector engine and ARIA formatting are maintained here as
owned source. They retain the pure implementation from `@vitest/browser` 5.0.4,
revision `6a11cf66f99fa610b7364363d5ca42b66d994f40`, previously kept in the
`next-test-primitives/browser/locator` bundle input. Their MIT notice is retained
in `locator/LICENSE`. The source has no browser-runner controller dependency.

`createBrowserLocatorFormatter` preserves the existing callable formatter
contract. Display formatting comes from the shared owned `utils/display`
implementation. CSS element serialization receives an explicit provider and
defaults to `playwright`; it does not inspect a runner global.

`dom.ts` reuses ordinary, unpatched `@testing-library/dom` 10.1.0 and
`@testing-library/jest-dom` 6.1.2. It exports query functions, `prettyDOM` and the
same raw matcher set: only callable named exports, excluding `default`. These
packages do not initialize an assertion registry. Browser dependency bundling
must honor package browser mappings, including those of `supports-color` and
`picocolors`, to keep Node platform imports outside the browser graph.
