import { addHookAliases } from '../require-hook'

// The probe worker is a freestanding Node entry — `tsc`-emitted JS, not
// bundled. Its `require('react-server-dom-webpack/server')` would otherwise
// fail in a real install because Next.js doesn't ship that package as a
// top-level dependency; only the vendored copies under `dist/compiled/` exist.
// Mirrors the alias convention from `create-compiler-aliases.ts` and
// `next-runtime.webpack-config.js`: source code always references
// `react-server-dom-webpack/*` and the alias layer picks the bundler-specific
// vendored target.
//
// This hook is loaded only by the worker process (jest-worker spawns it via
// `use-cache-probe-worker.ts`), so the shared `require-hook.ts` stays untouched
// and this redirect doesn't apply to any other entry.
const bundler = process.env.TURBOPACK ? 'turbopack' : 'webpack'

try {
  addHookAliases([
    [
      'react-server-dom-webpack/server',
      require.resolve(
        `next/dist/compiled/react-server-dom-${bundler}/server.node`
      ),
    ],
  ])
} catch {}
