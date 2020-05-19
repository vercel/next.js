import React, { Fragment, useState } from 'react'
import { useQuery } from 'graphql-hooks'
import ErrorMessage from './error-message'
import PostUpvoter from './post-upvoter'
import Submit from './submit'

export const allPostsQuery = `
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

export default function PostList() {
  const [skip, setSkip] = useState(0)
  const { loading, error, data, refetch } = useQuery(allPostsQuery, {
    variables: { skip, first: 10 },
    updateData: (prevResult, result) => ({
      ...result,
      allPosts: [...prevResult.allPosts, ...result.allPosts],
    }),
  })

  if (error) return <ErrorMessage message="Error loading posts." />
  if (!data) return <div>Loading</div>

  const { allPosts, _allPostsMeta } = data

  const areMorePosts = allPosts.length < _allPostsMeta.count
  return (
    <Fragment>
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
          <button onClick={() => setSkip(skip + 10)}>
            {' '}
            {loading && !data ? 'Loading...' : 'Show More'}{' '}
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
    </Fragment>
  )
}
