'use client'

// For this to work locally you need to use `pnpm next-with-deps dev|build`
// Make sure you delete node_modules if you are editing the package otherwise it won't
// reinstall and reflect your changes.

import ExportsDefault from 'my-external-cjs-package/exports'
import * as ExportsNamed from 'my-external-cjs-package/exports'
import { named as namedExports } from 'my-external-cjs-package/exports'

import ImportsDefault from 'my-external-cjs-package/imports'
import * as ImportsNamed from 'my-external-cjs-package/imports'
import { named as namedImports } from 'my-external-cjs-package/imports'

const pendingDynamicExports = import('my-external-cjs-package/exports').then(
  (mod) => JSON.stringify(mod)
)

const pendingDynamicImports = import('my-external-cjs-package/imports').then(
  (mod) => JSON.stringify(mod)
)

export default function Client() {
  return (
    <section>
      <h2>Client</h2>
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
  )
}
