import type {
  AnalyzeModule,
  OwnSideEffects,
  TransitiveSideEffects,
  UsedExports,
} from './analyze-data'

export interface TreeShakingInfo {
  usedExports: UsedExports
  ownSideEffects: OwnSideEffects
  transitiveSideEffects: TransitiveSideEffects
}

export interface ValueDiff<T> {
  before: T
  after: T
  changed: boolean
}

export interface UsedExportsDiff extends ValueDiff<UsedExports> {
  kind: 'exports' | 'transition'
  added: string[]
  removed: string[]
}

export interface TreeShakingDiff {
  usedExports: UsedExportsDiff
  ownSideEffects: ValueDiff<OwnSideEffects>
  transitiveSideEffects: ValueDiff<TransitiveSideEffects>
}

type TreeShakingModule = Pick<
  AnalyzeModule,
  'used_exports' | 'own_side_effects' | 'transitive_side_effects'
>

function hasTreeShakingInfo(
  module: TreeShakingModule
): module is Required<TreeShakingModule> {
  return (
    module.used_exports !== undefined &&
    module.own_side_effects !== undefined &&
    module.transitive_side_effects !== undefined
  )
}

export function summarizeTreeShaking(
  modules: readonly TreeShakingModule[]
): TreeShakingInfo | null {
  if (modules.length === 0 || !modules.every(hasTreeShakingInfo)) return null

  const exports = new Set<string>()
  let usesAllExports = false
  let usesEvaluation = false
  let hasNamedExportUsage = false
  let ownSideEffects: OwnSideEffects = 'free'
  let transitiveSideEffects: TransitiveSideEffects = 'free'

  for (const module of modules) {
    if (module.used_exports === 'all') {
      usesAllExports = true
    } else if (module.used_exports === 'evaluation') {
      usesEvaluation = true
    } else {
      hasNamedExportUsage = true
      for (const name of module.used_exports) exports.add(name)
    }

    if (module.own_side_effects === 'effectful') {
      ownSideEffects = 'effectful'
    } else if (
      module.own_side_effects === 'evaluation-free' &&
      ownSideEffects === 'free'
    ) {
      ownSideEffects = 'evaluation-free'
    }

    if (module.transitive_side_effects === 'effectful') {
      transitiveSideEffects = 'effectful'
    }
  }

  let usedExports: UsedExports
  if (usesAllExports) {
    usedExports = 'all'
  } else if (exports.size > 0 || (hasNamedExportUsage && !usesEvaluation)) {
    usedExports = [...exports].sort()
  } else if (usesEvaluation) {
    usedExports = 'evaluation'
  } else {
    usedExports = []
  }

  return { usedExports, ownSideEffects, transitiveSideEffects }
}

export function diffTreeShaking(
  before: TreeShakingInfo,
  after: TreeShakingInfo
): TreeShakingDiff {
  const bothNamed =
    Array.isArray(before.usedExports) && Array.isArray(after.usedExports)
  const beforeExports = new Set(
    Array.isArray(before.usedExports) ? before.usedExports : []
  )
  const afterExports = new Set(
    Array.isArray(after.usedExports) ? after.usedExports : []
  )
  const added = bothNamed
    ? [...afterExports].filter((name) => !beforeExports.has(name)).sort()
    : []
  const removed = bothNamed
    ? [...beforeExports].filter((name) => !afterExports.has(name)).sort()
    : []
  const usedExportsChanged = bothNamed
    ? added.length > 0 || removed.length > 0
    : !sameUsedExports(before.usedExports, after.usedExports)

  return {
    usedExports: {
      before: before.usedExports,
      after: after.usedExports,
      changed: usedExportsChanged,
      kind: bothNamed ? 'exports' : 'transition',
      added,
      removed,
    },
    ownSideEffects: valueDiff(before.ownSideEffects, after.ownSideEffects),
    transitiveSideEffects: valueDiff(
      before.transitiveSideEffects,
      after.transitiveSideEffects
    ),
  }
}

function sameUsedExports(a: UsedExports, b: UsedExports): boolean {
  if (!Array.isArray(a) || !Array.isArray(b)) return a === b
  if (a.length !== b.length) return false
  const bSet = new Set(b)
  return a.every((name) => bSet.has(name))
}

function valueDiff<T>(before: T, after: T): ValueDiff<T> {
  return { before, after, changed: before !== after }
}
