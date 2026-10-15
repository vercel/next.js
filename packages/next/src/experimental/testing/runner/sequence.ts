/** File/collection sequence settings; runtime mutation supports hooks only. */
export interface TestSequenceOptions {
  hooks?: 'stack' | 'list' | 'parallel'
  setupFiles?: 'list' | 'parallel'
  seed?: number
  concurrent?: boolean
  shuffle?: boolean | { files?: boolean; tests?: boolean }
}

export function shuffleTests(shuffleValue: TestSequenceOptions['shuffle']) {
  return typeof shuffleValue === 'object' ? shuffleValue.tests : shuffleValue
}

export function shuffleFiles(shuffleValue: TestSequenceOptions['shuffle']) {
  return typeof shuffleValue === 'object' ? shuffleValue.files : shuffleValue
}

/** Pinned Vitest 5.0.4 Fisher-Yates sequence; every invocation restarts the seed. */
export function shuffle<T>(values: T[], seed: number): T[] {
  let length = values.length
  while (length) {
    const random = Math.sin(seed++) * 1e4
    const index = Math.floor((random - Math.floor(random)) * length--)
    const previous = values[length]
    values[length] = values[index]
    values[index] = previous
  }
  return values
}

/** Child projects own test order, while the root owns the seed and file order. */
export function inheritGlobalTestSequence(
  project: TestSequenceOptions | undefined,
  root: TestSequenceOptions | undefined
): TestSequenceOptions {
  return {
    ...project,
    seed: root?.seed,
    shuffle: {
      files: shuffleFiles(root?.shuffle),
      tests: shuffleTests(project?.shuffle),
    },
  }
}
