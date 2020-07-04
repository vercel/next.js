import { END } from 'redux-saga'
import { wrapper, SagaStore } from '../store'
import { Search } from '../components/search'

const Index = () => {
  return <Search />
}

export const getStaticProps = wrapper.getStaticProps(async ({ store }) => {
  console.log(store.getState())
  store.dispatch(END)
  await (store as SagaStore).sagaTask?.toPromise()
})

export default Index
