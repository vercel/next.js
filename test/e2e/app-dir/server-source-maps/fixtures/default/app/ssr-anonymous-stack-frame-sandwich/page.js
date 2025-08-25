'use client'
import { runHiddenSetOfSets as runHiddenSetOfSetsExternal } from '@next-test-server-source-maps/external-pkg/sourcemapped'
import { runHiddenSetOfSets as runHiddenSetOfSetsInternal } from '@next-test-server-source-maps/internal-pkg/sourcemapped'

export default function Page() {
  runHiddenSetOfSetsExternal('ssr-anonymous-stack-frame-sandwich: external')
  runHiddenSetOfSetsInternal('ssr-anonymous-stack-frame-sandwich: internal')

  return null
}
