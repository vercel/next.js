import { ApolloConsumer } from 'react-apollo'
import gql from 'graphql-tag'
import { allPostsQuery, allPostsQueryVars } from './PostList'

export default function Submit () {
  return (
    <ApolloConsumer>
      {client => {
        function handleSubmit (event) {
          event.preventDefault()

          const form = event.target

          const formData = new window.FormData(form)
          createPost(formData.get('title'), formData.get('url'), client)

          form.reset()
        }

        return (
          <form onSubmit={handleSubmit}>
            <h1>Submit</h1>
            <input placeholder='title' name='title' type='text' required />
            <input placeholder='url' name='url' type='url' required />
            <button type='submit'>Submit</button>
            <style jsx>{`
              form {
                border-bottom: 1px solid #ececec;
                padding-bottom: 20px;
                margin-bottom: 20px;
              }
              h1 {
                font-size: 20px;
              }
              input {
                display: block;
                margin-bottom: 10px;
              }
            `}</style>
          </form>
        )
      }}
    </ApolloConsumer>
  )
}

const createPostMutation = gql`
  mutation createPost($title: String!, $url: String!) {
    createPost(title: $title, url: $url) {
      id
      title
      votes
      url
      createdAt
    }
  }
`

function createPost (title, url, client) {
  client.mutate({
    mutation: createPostMutation,
    variables: { title, url },
    update: (proxy, { data: { createPost } }) => {
      const data = proxy.readQuery({
        query: allPostsQuery,
        variables: allPostsQueryVars
      })
      proxy.writeQuery({
        query: allPostsQuery,
        data: {
          ...data,
          allPosts: [createPost, ...data.allPosts]
        },
        variables: allPostsQueryVars
      })
    }
  })
}
