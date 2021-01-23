import { serializeContext } from '@fleur/next'
import { GetStaticProps } from 'next'
import { Page } from '../components/page'
import { TimerOps } from '../domains/timer'
import { getOrCreateFleurContext, FleurSSProps } from '../lib/fleur'

export default function SSG() {
  return <Page />
}

export const getStaticProps: GetStaticProps<FleurSSProps> = async () => {
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
