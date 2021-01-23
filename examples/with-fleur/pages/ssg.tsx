import { serializeContext } from '@fleur/next'
import { GetStaticProps } from 'next'
import { Page } from '../components/page'
import { TimerOps } from '../domains/timer'
import { getOrCreateFleurContext, FleurSSProps } from '../lib/fleur'

export default function SSG() {
  return <Page />
}

export const getStaticProps: GetStaticProps<FleurSSProps> = async () => {
  const fleurCtx = getOrCreateFleurContext()

  await fleurCtx.executeOperation(TimerOps.increment)
  await fleurCtx.executeOperation(TimerOps.tick, {
    light: false,
    lastUpdate: Date.now(),
  })

  return {
    props: {
      __FLEUR_STATE__: serializeContext(fleurCtx),
    },
  }
}
