import gql from 'graphql-tag'
import { Mutation } from 'react-apollo'

import { allPosts, allPostsQueryVars } from './PostList'

const createPost = gql`
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

export default () => (
  <Mutation
    mutation={createPost}
    update={(proxy, { data: { createPost } }) => {
      const data = proxy.readQuery({
        query: allPosts,
        variables: allPostsQueryVars
      })
      proxy.writeQuery({
        query: allPosts,
        data: {
          ...data,
          allPosts: [createPost, ...data.allPosts]
        },
        variables: allPostsQueryVars
      })
    }}
  >
    {createPost => (
      <form
        onSubmit={event => {
          event.preventDefault()

          const form = event.currentTarget

          const formData = new window.FormData(form)
          createPost({
            variables: {
              title: formData.get('title'),
              url: formData.get('url')
            }
          })

          form.reset()
        }}
      >
        <h1>New Post</h1>
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
    )}
  </Mutation>
)
