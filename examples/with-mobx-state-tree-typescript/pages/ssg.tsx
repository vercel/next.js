import { getSnapshot } from 'mobx-state-tree'
import SampleComponent from '../components/SampleComponent'
import { initializeStore } from '../store'

export default function Ssg({ initialState }) {
  return <SampleComponent title={'SSG Page'} linkTo="/" store={initialState} />
}

// If you build and start the app, the date returned here will have the same
// value for all requests, as this method gets executed at build time.
export function getStaticProps() {
  const store = initializeStore()

  store.update()

  return { props: { initialState: getSnapshot(store) } }
}
