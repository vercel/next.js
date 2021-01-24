import { FleurishNextPage } from '@fleur/next'
import { Page } from '../components/page'
import { TimerOps } from '../domains/timer'
import { getStaticPropsWithFleur } from '../lib/fleur'

interface Props {}

export const SSG: FleurishNextPage<Props> = () => {
  return <Page />
}

export default SSG

export const getStaticProps = getStaticPropsWithFleur(async (context) => {
  await context.executeOperation(TimerOps.increment)
  await context.executeOperation(TimerOps.tick, {
    light: false,
    lastUpdate: Date.now(),
  })

  return {
    props: {},
  }
})
