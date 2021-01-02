import { Page } from '../components/page'
import { TimerOps } from '../domains/timer'
import { getOrCreateFleurContext } from '../lib/fleur'

export default function SSG() {
  return <Page />
}

export async function getStaticProps() {
  const context = getOrCreateFleurContext()

  await context.executeOperation(TimerOps.increment)
  await context.executeOperation(TimerOps.tick, {
    light: false,
    lastUpdate: Date.now(),
  })

  return {
    props: {
      __FLEUR_STATE__: context.dehydrate(),
    },
  }
}
