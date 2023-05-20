import { createOvermindSSR } from 'overmind'
import { config } from '../overmind'
import Header from '../components/Header'
import Items from '../components/Items'

export async function getStaticProps() {
  // If we want to produce some mutations we do so by instantiating
  // an Overmind SSR instance, do whatever datafetching is needed and
  // change the state directly. We return the mutations performed with
  // "hydrate"
  const overmind = createOvermindSSR(config)

  overmind.state.page = 'Index'
  overmind.state.items = [
    {
      id: 0,
      title: 'foo',
    },
    {
      id: 1,
      title: 'bar',
    },
  ]

  return {
    props: { mutations: overmind.hydrate() },
  }
}

export default function IndexPage() {
  return (
    <div>
      <Header />
      <Items />
    </div>
  )
}
