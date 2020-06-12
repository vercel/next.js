import { graphql, QueryRenderer, fetchQuery } from 'react-relay'
import { initEnvironment } from '../lib/createEnvironment'
import BlogPosts from '../components/BlogPosts'

const query = graphql`
  query pages_indexQuery {
    viewer {
      ...BlogPosts_viewer
    }
  }
`

const Index = ({ environment }) => (
  <QueryRenderer
    fetchPolicy="store-and-network"
    environment={environment}
    query={query}
    render={({ error, props }) => {
      if (error) return <div>{error.message}</div>
      else if (props) return <BlogPosts viewer={props.viewer} />
      return <div>Loading</div>
    }}
  />
)

export async function getStaticProps() {
  const { environment } = initEnvironment()

  await fetchQuery(environment, query)

  const records = environment.getStore().getSource().toJSON()

  return { props: { records } }
}

export default Index
