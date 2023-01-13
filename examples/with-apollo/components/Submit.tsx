import { useMutation } from '@apollo/client'
import { gql } from '@/gql'

const CREATE_POST_MUTATION = gql(/* GraphQL */ `
  mutation CreatePost($title: String!, $url: String!) {
    createPost(title: $title, url: $url) {
      id
      title
      votes
      url
      createdAt
    }
  }
`)

const NEW_POST_FRAGMENT = gql(/* GraphQL */ `
  fragment NewPost on Post {
    id
  }
`)

const Submit: React.FC = () => {
  const [createPost, { loading }] = useMutation(CREATE_POST_MUTATION)

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault()
    const form = event.currentTarget
    const formData = new window.FormData(form)
    const title = formData.get('title').toString()
    const url = formData.get('url').toString()
    form.reset()

    createPost({
      variables: { title, url },
      update: (cache, { data: { createPost } }) => {
        cache.modify({
          fields: {
            allPosts(existingPosts = []) {
              const newPostRef = cache.writeFragment({
                data: createPost,
                fragment: NEW_POST_FRAGMENT,
              })
              return [newPostRef, ...existingPosts]
            },
          },
        })
      },
    })
  }

  return (
    <form onSubmit={handleSubmit}>
      <h1>Submit</h1>
      <input placeholder="title" name="title" type="text" required />
      <input placeholder="url" name="url" type="url" required />
      <button type="submit" disabled={loading}>
        Submit
      </button>
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
}

export default Submit
