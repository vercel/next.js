import gql from 'graphql-tag'
import { Query } from 'react-apollo'

import PostUpvoter from './PostUpvoter'

export const allPosts = gql`
  query allPosts($first: Int!, $skip: Int!) {
    allPosts(orderBy: createdAt_DESC, first: $first, skip: $skip) {
      id
      title
      votes
      url
      createdAt
    }
    _allPostsMeta {
      count
    }
  }
`
export const allPostsQueryVars = {
  skip: 0,
  first: 10
}

export default () => (
  <Query query={allPosts} variables={allPostsQueryVars}>
    {({ data: { allPosts, _allPostsMeta }, error, fetchMore, loading }) => {
      if (error) {
        return (
          <aside>
            Error loading posts.
            <style jsx>{`
              aside {
                padding: 1.5em;
                font-size: 14px;
                color: white;
                background-color: red;
              }
            `}</style>
          </aside>
        )
      }

      if (loading) {
        return <div>Loading</div>
      }

      if (allPosts && allPosts.length) {
        const areMorePosts = allPosts.length < _allPostsMeta.count

        return (
          <section>
            <ul>
              {allPosts.map((post, index) => (
                <li key={post.id}>
                  <div>
                    <span>{index + 1}. </span>
                    <a href={post.url}>{post.title}</a>
                    <PostUpvoter id={post.id} votes={post.votes} />
                  </div>
                </li>
              ))}
            </ul>
            {areMorePosts ? (
              <button
                onClick={() => {
                  fetchMore({
                    variables: {
                      skip: allPosts.length
                    },
                    updateQuery: (previousResult, { fetchMoreResult }) => {
                      if (!fetchMoreResult) {
                        return previousResult
                      }

                      return {
                        ...previousResult,
                        allPosts: [
                          ...previousResult.allPosts,
                          ...fetchMoreResult.allPosts
                        ]
                      }
                    }
                  })
                }}
              >
                {loading ? 'Loading...' : 'Show More'}
              </button>
            ) : null}
            <style jsx>{`
              section {
                padding-bottom: 20px;
              }
              li {
                display: block;
                margin-bottom: 10px;
              }
              div {
                align-items: center;
                display: flex;
              }
              a {
                font-size: 14px;
                margin-right: 10px;
                text-decoration: none;
                padding-bottom: 0;
                border: 0;
              }
              span {
                font-size: 14px;
                margin-right: 5px;
              }
              ul {
                margin: 0;
                padding: 0;
              }
              button:before {
                align-self: center;
                border-style: solid;
                border-width: 6px 4px 0 4px;
                border-color: #ffffff transparent transparent transparent;
                content: '';
                height: 0;
                margin-right: 5px;
                width: 0;
              }
            `}</style>
          </section>
        )
      }
    }}
  </Query>
)
