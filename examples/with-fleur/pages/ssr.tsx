import { serializeContext } from '@fleur/next'
import { GetServerSideProps } from 'next'
import { Page } from '../components/page'
import { TimerOps } from '../domains/timer'
import { FleurSSProps, getOrCreateFleurContext } from '../lib/fleur'

export default function SSR() {
  return <Page />
}

export const getServerSideProps: GetServerSideProps<FleurSSProps> = async () => {
  const fleurCtx = getOrCreateFleurContext()

  await fleurCtx.executeOperation(TimerOps.increment)
  await fleurCtx.executeOperation(TimerOps.tick, {
    light: false,
    lastUpdate: Date.now(),
  })

  return { props: { __FLEUR_STATE__: serializeContext(fleurCtx) } }
}
