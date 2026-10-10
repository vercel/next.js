import type { ReactNode } from 'react'
import { waitForGenerator } from './state'

export async function generateMetadata() {
  let timeout: NodeJS.Timeout
  const generatorsStartedEagerly = await Promise.race([
    Promise.all([waitForGenerator('children'), waitForGenerator('slot')]).then(
      () => true
    ),
    new Promise<boolean>((resolve) => {
      timeout = setTimeout(() => resolve(false), 5000)
    }),
  ])
  clearTimeout(timeout!)

  return {
    description: generatorsStartedEagerly
      ? 'parallel generators started eagerly'
      : 'parallel generators were serialized',
  }
}

export async function generateViewport() {
  let timeout: NodeJS.Timeout
  const generatorsStartedEagerly = await Promise.race([
    Promise.all([
      waitForGenerator('children-viewport'),
      waitForGenerator('slot-viewport'),
    ]).then(() => true),
    new Promise<boolean>((resolve) => {
      timeout = setTimeout(() => resolve(false), 5000)
    }),
  ])
  clearTimeout(timeout!)

  return {
    colorScheme: generatorsStartedEagerly
      ? ('dark' as const)
      : ('light' as const),
  }
}

export default function Layout({
  children,
  slot,
}: {
  children: ReactNode
  slot: ReactNode
}) {
  return (
    <main>
      {children}
      {slot}
    </main>
  )
}
