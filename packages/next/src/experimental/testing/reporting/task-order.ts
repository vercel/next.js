/** Sort retained declarations by their producer's numeric tree path. */
export function orderTestDeclarations<T>(
  parentId: string,
  tasks: readonly T[],
  identify: (task: T) => string
): T[] {
  const indexed = tasks.map((task) => {
    const id = identify(task)
    const suffix = id.startsWith(`${parentId}/`)
      ? id.slice(parentId.length + 1)
      : ''
    const indices = suffix.split('/').map(Number)
    return {
      task,
      indices,
      valid:
        /^\d+(?:\/\d+)*$/.test(suffix) &&
        indices.every((index) => Number.isSafeInteger(index)),
    }
  })
  // Legacy producers did not retain declaration paths. Keep their evidence order.
  if (indexed.some((item) => !item.valid)) return [...tasks]
  return indexed
    .sort((left, right) => {
      for (
        let index = 0;
        index < Math.min(left.indices.length, right.indices.length);
        index++
      ) {
        const difference = left.indices[index] - right.indices[index]
        if (difference) return difference
      }
      return left.indices.length - right.indices.length
    })
    .map((item) => item.task)
}

/** Match terminal reporter modules to their original selected specifications. */
export function orderTestSpecifications<T>(
  tasks: readonly T[],
  specificationOrder: readonly string[] | undefined,
  identify: (task: T) => string
): T[] {
  const indices = new Map(specificationOrder?.map((id, index) => [id, index]))
  return [...tasks].sort(
    (left, right) =>
      (indices.get(identify(left)) ?? Infinity) -
      (indices.get(identify(right)) ?? Infinity)
  )
}
