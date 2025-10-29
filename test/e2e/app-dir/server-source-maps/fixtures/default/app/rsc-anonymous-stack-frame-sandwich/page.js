import { runHiddenSetOfSets as runHiddenSetOfSetsExternal } from 'external-pkg/sourcemapped'
import { runHiddenSetOfSets as runHiddenSetOfSetsInternal } from 'internal-pkg/ignored'

export default function Page() {
  runHiddenSetOfSetsExternal('rsc-anonymous-stack-frame-sandwich: external')
  runHiddenSetOfSetsInternal('rsc-anonymous-stack-frame-sandwich: internal')

  return null
}
