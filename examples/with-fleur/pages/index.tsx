import { serializeContext } from '@fleur/next'
import { NextPage } from 'next'
import { Page } from '../components/page'
import { TimerOps } from '../domains/timer'
import { FleurSSProps, getOrCreateFleurContext } from '../lib/fleur'

const Index: NextPage<{}, FleurSSProps> = () => {
  return <Page />
}

Index.getInitialProps = async () => {
  const fleurContext = getOrCreateFleurContext()

  await fleurContext.executeOperation(TimerOps.increment)
  await fleurContext.executeOperation(TimerOps.tick, {
    light: false,
    lastUpdate: Date.now(),
  })

  return { __FLEUR_STATE__: serializeContext(fleurContext) }
}

export default Index
