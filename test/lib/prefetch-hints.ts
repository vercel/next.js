import {
  PrefetchHint,
  type PrefetchHints,
} from 'next/src/shared/lib/app-router-types'

const hintsEnumAsObject = Object.fromEntries(
  Object.entries(
    // @ts-expect-error - const enum (which jest ignores)
    PrefetchHint
  )
)

const prefetchHintsByName = Object.fromEntries(
  Object.entries(hintsEnumAsObject)
    .filter(([, value]) => typeof value === 'number')
    .map((entry) => entry as [string, PrefetchHint])
)

export function prefetchHintsValuesToHumanReadableString(
  hintsValue: number,
  mask?: number
): string {
  const names: string[] = []
  let hasMaskedValues = false
  for (const [name, bit] of Object.entries(prefetchHintsByName)) {
    if ((hintsValue & bit) !== 0) {
      if (mask !== undefined) {
        if (bit & mask) {
          names.push(name)
        } else {
          // if the value is not included in the mask, omit it.
          hasMaskedValues = true
        }
      } else {
        names.push(name)
      }
    }
  }
  // indicate if we've omitted some values due to a mask.
  if (hasMaskedValues) {
    names.push('...')
  }
  return names.join(' | ')
}

export type HintsManifest = { [route: string]: PrefetchHints }

export type HumanReadableHints = {
  hints: string
  slots: null | Record<string, HumanReadableHints>
}

export function getHumanReadablePrefetchHints(
  tree: PrefetchHints,
  mask?: number
): HumanReadableHints {
  return {
    hints: prefetchHintsValuesToHumanReadableString(tree.hints, mask),
    slots:
      tree.slots === null
        ? null
        : Object.fromEntries(
            Object.entries(tree.slots).map(([name, slot]) => [
              name,
              getHumanReadablePrefetchHints(slot, mask),
            ])
          ),
  }
}
