/** Browser artifact source names are normalized to forward slashes. */
export function basename(value: string) {
  return value.slice(value.lastIndexOf('/') + 1)
}

/** Browser artifact source paths already use forward slashes. */
export function relative(from: string, to: string) {
  const base = from.split('/').filter(Boolean)
  const target = to.split('/').filter(Boolean)
  let shared = 0
  while (shared < base.length && base[shared] === target[shared]) shared++
  return [...base.slice(shared).map(() => '..'), ...target.slice(shared)].join(
    '/'
  )
}
