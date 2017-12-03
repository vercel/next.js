import { graphql } from 'react-apollo'
import gql from 'graphql-tag'
import {allPosts, allPostsQueryVars} from './PostList'

function Submit ({ createPost }) {
  function handleSubmit (e) {
    e.preventDefault()

    let title = e.target.elements.title.value
    let url = e.target.elements.url.value

    if (title === '' || url === '') {
      window.alert('Both fields are required.')
      return false
    }

    // prepend http if missing from url
    if (!url.match(/^[a-zA-Z]+:\/\//)) {
      url = `http://${url}`
    }

    createPost(title, url)

    // reset form
    e.target.elements.title.value = ''
    e.target.elements.url.value = ''
  }

  return (
    <form onSubmit={handleSubmit}>
      <h1>Submit</h1>
      <input placeholder='title' name='title' />
      <input placeholder='url' name='url' />
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
}

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

export default graphql(createPost, {
  props: ({ mutate }) => ({
    createPost: (title, url) => mutate({
      variables: { title, url },
      update: (proxy, { data: { createPost } }) => {
        const data = proxy.readQuery({ query: allPosts, variables: allPostsQueryVars })
        proxy.writeQuery({ query: allPosts, data: {allPosts: [createPost, ...data.allPosts]}, variables: allPostsQueryVars })
      }
    })
  })
})(Submit)
