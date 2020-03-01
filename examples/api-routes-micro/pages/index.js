import fetch from 'isomorphic-unfetch'

const Index = ({ posts }) => (
  <ul>
    {posts.map((post, i) => (
      <li key={i}>{post.title}</li>
    ))}
  </ul>
)

Index.getInitialProps = async () => {
  const response = await fetch('http://localhost:3000/api/posts')
  const posts = await response.json()

  return { posts }
}

export default Index
