import { graphql, useRelayEnvironment, QueryRenderer } from 'react-relay'

import type { pagesQueryResponse } from '@/types/pagesQuery.graphql'

function Component() {
  const env = useRelayEnvironment()
  return (
    <QueryRenderer
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
      render={({ props }: { props: pagesQueryResponse }) => {
        if (props) {
          return (
            <div>
              Data requested: <span>{props.viewer.user.id}</span>
            </div>
          )
        }

        return <div>Loading...</div>
      }}
    />
  )
}

export default Component
