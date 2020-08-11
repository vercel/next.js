import { gql, useQuery } from '@apollo/client'
import ErrorMessage from './ErrorMessage'
import PostUpvoter from './PostUpvoter'
import { useRouter } from 'next/router'
import Link from 'next/link'

export const POST_BY_ID = gql`
  query Post($id: String!) {
    Post(id: $id) {
      title
      url
      votes
      createdAt
    }
  }
`

export default function Post() {
  const router = useRouter()
  const { id } = router.query
  const { loading, error, data } = useQuery(POST_BY_ID, {
    variables: { id },
    // Setting this value to true will make the component rerender when
    // the "networkStatus" changes, so we are able to know if it is fetching
    // more data
    notifyOnNetworkStatusChange: true,
  })

  if (error) return <ErrorMessage message="Error loading this post." />
  if (loading) return <div>Loading</div>

  const { Post } = data

  return (
    <section>
      <ul>
        <li>
          <div>
            <a href={Post.url}>{Post.title}</a>
            <PostUpvoter id={Post.id} votes={Post.votes} />
          </div>
        </li>
      </ul>
      <Link href="/" as="/">
        <a>Go Back</a>
      </Link>
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
