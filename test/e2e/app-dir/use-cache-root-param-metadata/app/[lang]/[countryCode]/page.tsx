import { readDirect } from './read-direct'
import { readTransitive } from './read-transitive'
import { readConditional } from './read-conditional'
import { readNested } from './read-nested'
import { readNamespace } from './read-namespace'
import { readIndependent } from './read-independent'
import { readAlias } from './read-alias'
import { readComponent } from './read-component'
import { readDynamicImport } from './read-dynamic-import'
import { readRequire } from './read-require'
import { readArguments } from './read-arguments'
import { foo, bar } from './read-module'
import { readCycle } from './read-cycle'
import { readLookalike } from './read-lookalike'
import { readClient } from './read-client'

export default async function Page() {
  const values = await Promise.all([
    readDirect(),
    readTransitive(),
    readConditional(),
    readNested(),
    readNamespace('lang'),
    readIndependent(),
    readAlias(),
    readDynamicImport(),
    readRequire(),
    readArguments(true),
    foo(),
    bar(),
    readCycle().then((value) => `cycle:${value}`),
    readLookalike(),
  ])
  const component = await readComponent()
  const client = await readClient()
  return (
    <p>
      {values.join(' ')} {component} {client}
    </p>
  )
}
