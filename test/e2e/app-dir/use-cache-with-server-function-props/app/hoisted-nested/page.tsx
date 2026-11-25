import { ActionTrigger } from './client-controls'

export default async function Page() {
  const noClosureResult = await callNestedNoClosure()
  const mutatedCacheResults = await callNestedMutatedCache()

  return (
    <main>
      <p id="no-closure">{noClosureResult}</p>
      <p id="mutated-cache">{mutatedCacheResults.join(',')}</p>
      <HoistedServerActions />
      <LoopScopedActions items={['item-0', 'item-1']} />
    </main>
  )
}

function callNestedNoClosure() {
  return bar()

  async function bar() {
    'use cache'

    return 1234
  }
}

async function callNestedMutatedCache() {
  let step = 'first'
  const r1 = await readStep()
  step = 'second'
  const r2 = await readStep()
  return [r1, r2]

  async function readStep() {
    'use cache'

    return step
  }
}

function HoistedServerActions() {
  const boundBeforeInit = readBound.bind(null, 'extra')
  const triggers = (
    <>
      <ActionTrigger id="mutated-action" action={readMutated} />
      <ActionTrigger id="bound-action" action={boundBeforeInit} />
    </>
  )

  let label = 'initial'
  label = 'updated'

  return triggers

  async function readMutated() {
    'use server'

    return label
  }

  async function readBound(suffix: string) {
    'use server'

    return `${label}:${suffix}`
  }
}

function LoopScopedActions({ items }: { items: string[] }) {
  const triggers = []

  for (let i = 0; i < items.length; i++) {
    triggers.push(<ActionTrigger key={i} id={`loop-${i}`} action={readItem} />)

    async function readItem() {
      'use server'

      return items[i]
    }
  }

  return <>{triggers}</>
}
