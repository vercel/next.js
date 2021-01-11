import { useState } from 'react'
import { useQuery } from 'graphql-hooks'
import ErrorMessage from './error-message'
import PostUpvoter from './post-upvoter'
import Submit from './submit'

export const ALL_POSTS_QUERY = `
  query allPosts($first: Int!, $skip: Int!) {
    allPosts(orderBy: { createdAt: desc }, first: $first, skip: $skip) {
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

export const allPostsQueryOptions = (skip = 0) => ({
  variables: { skip, first: 10 },
  updateData: (prevResult, result) => ({
    ...result,
    allPosts: prevResult
      ? [...prevResult.allPosts, ...result.allPosts]
      : result.allPosts,
  }),
})

export default function PostList() {
  const [skip, setSkip] = useState(0)
  const { loading, error, data, refetch } = useQuery(
    ALL_POSTS_QUERY,
    allPostsQueryOptions(skip)
  )

  if (error) return <ErrorMessage message="Error loading posts." />
  if (!data) return <div>Loading</div>

  const { allPosts, _allPostsMeta } = data
  const areMorePosts = allPosts.length < _allPostsMeta.count

  return (
    <>
      <Submit
        onSubmission={() => {
          refetch({ variables: { skip: 0, first: allPosts.length } })
        }}
      />
      <section>
        <ul>
          {allPosts.map((post, index) => (
            <li key={post.id}>
              <div>
                <span>{index + 1}. </span>
                <a href={post.url}>{post.title}</a>
                <PostUpvoter
                  id={post.id}
                  votes={post.votes}
                  onUpdate={() => {
                    refetch({ variables: { skip: 0, first: allPosts.length } })
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
        {areMorePosts ? (
          <button className="more" onClick={() => setSkip(skip + 10)}>
            {' '}
            {loading && !data ? 'Loading...' : 'Show More'}{' '}
          </button>
        ) : (
          ''
        )}
      </section>
    </>
  )
}
