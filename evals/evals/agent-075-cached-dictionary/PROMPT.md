Our marketing site serves every page under a locale prefix: /en and /fr today, with more locales coming. Translations load through `getDictionary()` in `lib/dictionary.ts`, our cached dictionary loader. It takes no arguments, and a dozen call sites invoke it exactly as `getDictionary()` — the layout nav, both pages, and the Greeting component in this repo, plus other teams' packages that import it. That zero-argument signature is frozen public API: you may not change the signature, and you may not change how any existing call site calls it.

The bug: the French pages render English. Open /fr or /fr/about and every string comes out of the English dictionary.

What done looks like:

- Each locale's pages render that locale's strings: /fr and /fr/about in French, /en and /en/about in English.
- Translations stay cached. Repeat requests for the same locale must not reload that locale's dictionary — every page renders the loader's `loadedAt` stamp in its footer (the `[data-testid="dict-stamp"]` element), and for a given locale that stamp must hold stable across requests. Keep the footers and their test id.
- `npm run build` stays green, and both locales' pages stay fully prerenderable at build time, exactly as they are today.
- The dictionary JSON stays in `data/dictionaries/` with the same file names, and `lib/dictionary.ts` stays the only code that reads those files.
