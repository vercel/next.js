import { useDispatch } from 'react-redux'
import { renderWithApollo } from '../lib/apollo'
import useInterval from '../lib/useInterval'
import Layout from '../components/Layout'
import Clock from '../components/Clock'
import Counter from '../components/Counter'
import Submit from '../components/Submit'
import PostList from '../components/PostList'

const IndexPage = () => {
  // Tick the time every second
  const dispatch = useDispatch()
  useInterval(() => {
    dispatch({
      type: 'TICK',
      light: true,
      lastUpdate: Date.now(),
    })
  }, 1000)

  return (
    <Layout>
      {/* Redux */}
      <Clock />
      <Counter />
      <hr />
      {/* Apollo */}
      <Submit />
      <PostList />
    </Layout>
  )
}

export function getStaticProps() {
  renderWithApollo(IndexPage)
  return {
    props: {},
  }
}

export default IndexPage
