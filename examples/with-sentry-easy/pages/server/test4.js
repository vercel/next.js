import unfetch from '../../util/unfetch'

function HomePage({ user }) {
  return <div>user count: {user.length}</div>
}

HomePage.getInitialProps = async () => {
  const data = await unfetch.get('https://jsonplaceholder.typicode.com/user')
  return { user: data }
}

export default HomePage
