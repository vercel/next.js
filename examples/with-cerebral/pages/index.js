import { Controller } from 'cerebral'
import Devtools from 'cerebral/devtools'
import { Container } from '@cerebral/react'
import Page from '../components/Page'
import clock from '../modules/clock'

const Home = (props) => {
  const { stateChanges } = props

  const controller = Controller({
    devtools:
      process.env.NODE_ENV === 'production' || typeof window === 'undefined'
        ? null
        : Devtools({ host: 'localhost:8787' }),
    modules: { clock },
    stateChanges: stateChanges,
  })

  return (
    <Container controller={controller}>
      <Page title="Index Page" linkTo="/other" />
    </Container>
  )
}

export default Home
