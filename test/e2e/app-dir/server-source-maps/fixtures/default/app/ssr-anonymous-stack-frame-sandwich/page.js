'use client'
import { runHiddenSetOfSets as runHiddenSetOfSetsExternal } from 'external-pkg/sourcemapped'
import { runHiddenSetOfSets as runHiddenSetOfSetsInternal } from 'internal-pkg/sourcemapped'

export default function Page() {
  runHiddenSetOfSetsExternal('ssr-anonymous-stack-frame-sandwich: external')
  runHiddenSetOfSetsInternal('ssr-anonymous-stack-frame-sandwich: internal')

  return null
}
