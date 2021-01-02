import { serializeContext } from '@fleur/next'
import { GetStaticPropsResult } from 'next'
import { Page } from '../components/page'
import { TimerOps } from '../domains/timer'
import { getOrCreateFleurContext } from '../lib/fleur'

export default function SSG() {
  return <Page />
}

export async function getStaticProps(): Promise<
  GetStaticPropsResult<{
    __FLEUR_STATE__: string
  }>
> {
  const context = getOrCreateFleurContext()

  await context.executeOperation(TimerOps.increment)
  await context.executeOperation(TimerOps.tick, {
    light: false,
    lastUpdate: Date.now(),
  })

  return {
    props: {
      __FLEUR_STATE__: serializeContext(context),
    },
  }
}
