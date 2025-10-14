// For this to work locally you need to use `pnpm next-with-deps dev|build`
// Make sure you delete node_modules if you are editing the package otherwise it won't
// reinstall and reflect your changes.

// @ts-expect-error -- the package isn't installed in your IDE in a way TS understands
import ExportsDefault from 'my-esm-package/exports'
// @ts-expect-error -- the package isn't installed in your IDE in a way TS understands
import * as ExportsNamed from 'my-esm-package/exports'
// @ts-expect-error -- the package isn't installed in your IDE in a way TS understands
import { named as namedExports } from 'my-esm-package/exports'

// @ts-expect-error -- the package isn't installed in your IDE in a way TS understands
import ImportsDefault from 'my-esm-package/imports'
// @ts-expect-error -- the package isn't installed in your IDE in a way TS understands
import * as ImportsNamed from 'my-esm-package/imports'
// @ts-expect-error -- the package isn't installed in your IDE in a way TS understands
import { named as namedImports } from 'my-esm-package/imports'

// @ts-expect-error -- the package isn't installed in your IDE in a way TS understands
const pendingDynamicExports = import('my-esm-package/exports').then((mod) =>
  JSON.stringify(mod)
)

// @ts-expect-error -- the package isn't installed in your IDE in a way TS understands
const pendingDynamicImports = import('my-esm-package/imports').then((mod) =>
  JSON.stringify(mod)
)

import Client from './client'

export default function Page() {
  return (
    <>
      <section>
        <h2>Server</h2>
        <section>
          <h3>Exports</h3>
          <section>
            <h4>Static</h4>
            <label>Default:</label>
            <div>{JSON.stringify(ExportsDefault)}</div>
            <label>Namespace:</label>
            <div>{JSON.stringify(ExportsNamed)}</div>
            <label>named:</label>
            <div>{JSON.stringify(namedExports)}</div>
          </section>
          <section>
            <h4>Dynamic</h4>
            <div>{pendingDynamicExports}</div>
          </section>
        </section>
        <section>
          <h3>Imports</h3>
          <section>
            <h4>Static</h4>
            <label>Default:</label>
            <div>{JSON.stringify(ImportsDefault)}</div>
            <label>Namespace:</label>
            <div>{JSON.stringify(ImportsNamed)}</div>
            <label>named:</label>
            <div>{JSON.stringify(namedImports)}</div>
          </section>
          <section>
            <h4>Dynamic</h4>
            <div>{pendingDynamicImports}</div>
          </section>
        </section>
      </section>
      <Client />
    </>
  )
}
