import { FleurishNextPageContext, serializeContext } from '@fleur/next'
import { NextPage } from 'next'
import { Page } from '../components/page'
import { TimerOps } from '../domains/timer'
import { FleurSSProps } from '../lib/fleur'

const Index: NextPage<{}, FleurSSProps> = () => {
  return <Page />
}

Index.getInitialProps = async (context: FleurishNextPageContext) => {
  await context.executeOperation(TimerOps.increment)
  await context.executeOperation(TimerOps.tick, {
    light: false,
    lastUpdate: Date.now(),
  })

  return { __FLEUR_STATE__: serializeContext(context.fleurContext) }
}

export default Index
