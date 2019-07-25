import fetch from 'isomorphic-unfetch'

const Index = ({ cookie }) => <div>{`Cookie from response: ${cookie}`}</div>

Index.getInitialProps = async () => {
  const response = await fetch('http://localhost:3000/api/cookies')
  const cookie = response.headers.get('set-cookie')

  return { cookie }
}

export default Index
