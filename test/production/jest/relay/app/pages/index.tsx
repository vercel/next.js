import { graphql, useRelayEnvironment, QueryRenderer } from 'react-relay'

import type { pagesQuery } from '@/types/pagesQuery.graphql'

function Component() {
  const env = useRelayEnvironment()
  return (
    <QueryRenderer<pagesQuery>
      environment={env}
      query={graphql`
        query pagesQuery {
          viewer {
            user {
              id
              name
            }
          }
        }
      `}
      render={({ props }) => {
        if (props) {
          return (
            <div>
              Data requested: <span>{props.viewer.user.id}</span>
            </div>
          )
        }

        return <div>Loading...</div>
      }}
      variables={{}}
    />
  )
}

export default Component
