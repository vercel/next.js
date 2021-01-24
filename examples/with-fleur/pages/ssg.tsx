import { serializeContext } from '@fleur/next'
import { GetStaticProps, NextPage } from 'next'
import { Page } from '../components/page'
import { TimerOps } from '../domains/timer'
import { getOrCreateFleurContext, FleurSSProps } from '../lib/fleur'

interface Props {}

export const SSG: NextPage<Props> = () => {
  return <Page />
}

export default SSG

export const getStaticProps: GetStaticProps<
  FleurSSProps & Props
> = async () => {
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
