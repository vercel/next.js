import { graphql, fetchQuery } from 'react-relay'
import { useQuery } from 'relay-hooks'

import { initEnvironment } from '../lib/createEnvironment'
import BlogPosts from '../components/BlogPosts'

const query = graphql`
  query pages_indexQuery {
    viewer {
      ...BlogPosts_viewer
    }
  }
`

const Index = ({ environment }) => {
  const { error, props } = useQuery(query)

  if (error) return <div>{error.message}</div>

  if (!props) return <div>Loading</div>

  return <BlogPosts viewer={props.viewer} />
}

export async function getStaticProps() {
  const { environment, relaySSR } = initEnvironment()

  await fetchQuery(environment, query)

  return { props: { relayData: await relaySSR.getCache() } }
}

export default Index
