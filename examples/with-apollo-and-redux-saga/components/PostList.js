import { graphql } from 'react-apollo'
import gql from 'graphql-tag'
import { Router } from '../routes'
import ErrorMessage from './ErrorMessage'
import PostVoteUp from './PostVoteUp'
import PostVoteDown from './PostVoteDown'
import PostVoteCount from './PostVoteCount'

const POSTS_PER_PAGE = 10

function handleClick (event, id) {
  event.preventDefault()
  // With route name and params
  // Router.pushRoute('blog/entry', { id: id })
  // With route URL
  Router.pushRoute(`/blog/${id}`)
}

function PostList ({
  data: { loading, error, allPosts, _allPostsMeta },
  loadMorePosts
}) {
  if (error) return <ErrorMessage message='Error loading posts.' />
  if (allPosts && allPosts.length) {
    const areMorePosts = allPosts.length < _allPostsMeta.count
    return (
      <section>
        <ul>
          {allPosts.map((post, index) => (
            <li key={post.id}>
              <div>
                <span>{index + 1}. </span>
                <a
                  href={`/blog/${post.id}`}
                  onClick={event => handleClick(event, post.id)}
                >
                  {post.title}
                </a>
                <PostVoteUp id={post.id} votes={post.votes} />
                <PostVoteCount votes={post.votes} />
                <PostVoteDown id={post.id} votes={post.votes} />
              </div>
            </li>
          ))}
        </ul>
        {areMorePosts ? (
          <button onClick={() => loadMorePosts()}>
            {' '}
            {loading ? 'Loading...' : 'Show More'}{' '}
          </button>
        ) : (
          ''
        )}
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
  return <div>Loading</div>
}

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
  first: POSTS_PER_PAGE
}

// The `graphql` wrapper executes a GraphQL query and makes the results
// available on the `data` prop of the wrapped component (PostList)
export default graphql(allPosts, {
  options: {
    variables: allPostsQueryVars
  },
  props: ({ data }) => ({
    data,
    loadMorePosts: () => {
      return data.fetchMore({
        variables: {
          skip: data.allPosts.length
        },
        updateQuery: (previousResult, { fetchMoreResult }) => {
          if (!fetchMoreResult) {
            return previousResult
          }
          return Object.assign({}, previousResult, {
            // Append the new posts results to the old one
            allPosts: [...previousResult.allPosts, ...fetchMoreResult.allPosts]
          })
        }
      })
    }
  })
})(PostList)
