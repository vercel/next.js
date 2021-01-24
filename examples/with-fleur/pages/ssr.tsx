import { serializeContext } from '@fleur/next'
import { GetServerSideProps, NextPage } from 'next'
import { Page } from '../components/page'
import { TimerOps } from '../domains/timer'
import { FleurSSProps, getOrCreateFleurContext } from '../lib/fleur'

interface Props {}

export const SSR: NextPage<Props> = () => {
  return <Page />
}

export default SSR

export const getServerSideProps: GetServerSideProps<
  FleurSSProps & Props
> = async () => {
  const fleurCtx = getOrCreateFleurContext()

  await fleurCtx.executeOperation(TimerOps.increment)
  await fleurCtx.executeOperation(TimerOps.tick, {
    light: false,
    lastUpdate: Date.now(),
  })

  return { props: { __FLEUR_STATE__: serializeContext(fleurCtx) } }
}
