import { ActionTrigger } from './client-controls'

export default async function Page() {
  const noClosureResult = await callNestedNoClosure()

  return (
    <main>
      <p id="no-closure">{noClosureResult}</p>
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

function HoistedServerActions() {
  const label = 'updated'
  const boundAction = readBound.bind(null, 'extra')

  return (
    <>
      <ActionTrigger id="label-action" action={readLabel} />
      <ActionTrigger id="bound-action" action={boundAction} />
    </>
  )

  async function readLabel() {
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
