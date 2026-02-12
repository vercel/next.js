export type ComponentSeed = {
  id: string
  name: string
  group: string
  weight: number
}

const data: ComponentSeed[] = []
const byId = new Map<string, ComponentSeed>()

for (let i = 0; i < 1000; i++) {
  const entry: ComponentSeed = {
    id: `id-${i}`,
    name: `component-${i}`,
    group: `group-${i % 40}`,
    weight: i % 13,
  }

  data.push(entry)
  byId.set(entry.id, entry)
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

function getSeed(id: string) {
  const seed = byId.get(id)
  if (!seed) {
    throw new Error(`Unknown id: ${id}`)
  }
  return seed
}

export function testData() {
  return data
}

export async function fetchComponentMeta(id: string) {
  const seed = getSeed(id)
  await sleep((seed.weight % 3) + 1)
  return {
    id: seed.id,
    name: seed.name,
    group: seed.group,
  }
}

export async function fetchComponentPayload(id: string) {
  const seed = getSeed(id)
  await sleep((seed.weight % 5) + 1)
  return {
    score: seed.weight * 10 + id.length,
    tags: [`tag-${seed.weight}`, `bucket-${seed.weight % 4}`],
  }
}

export async function fetchComponentDetails(id: string) {
  const seed = getSeed(id)
  await sleep((seed.weight % 4) + 1)
  return {
    detail: `detail-${seed.id}-${seed.weight}`,
    checksum: `${seed.group}-${seed.weight * 7}`,
  }
}
