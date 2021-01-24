import { FleurishNextPage } from '@fleur/next'
import { Page } from '../components/page'
import { TimerOps } from '../domains/timer'
import { getServerSidePropsWithFleur } from '../lib/fleur'

interface Props {}

export const SSR: FleurishNextPage<Props> = () => {
  return <Page />
}

export default SSR

export const getServerSideProps = getServerSidePropsWithFleur(
  async (context) => {
    await context.executeOperation(TimerOps.increment)
    await context.executeOperation(TimerOps.tick, {
      light: false,
      lastUpdate: Date.now(),
    })

    return { props: {} }
  }
)
