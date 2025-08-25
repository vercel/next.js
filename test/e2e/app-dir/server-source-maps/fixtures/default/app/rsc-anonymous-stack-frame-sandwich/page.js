import { runHiddenSetOfSets as runHiddenSetOfSetsExternal } from '@next-test-server-source-maps/external-pkg/sourcemapped'
import { runHiddenSetOfSets as runHiddenSetOfSetsInternal } from '@next-test-server-source-maps/internal-pkg/ignored'

export default function Page() {
  runHiddenSetOfSetsExternal('rsc-anonymous-stack-frame-sandwich: external')
  runHiddenSetOfSetsInternal('rsc-anonymous-stack-frame-sandwich: internal')

  return null
}
