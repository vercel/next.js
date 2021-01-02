import { FleurishNextPageContext, serializeContext } from '@fleur/next'
import { Page } from '../components/page'
import { TimerOps } from '../domains/timer'
export default function Index() {
  return <Page />
}

Index.getInitialProps = async (context: FleurishNextPageContext) => {
  await context.executeOperation(TimerOps.increment)
  return { __FLEUR_STATE__: serializeContext(context.fleurContext) }
}
