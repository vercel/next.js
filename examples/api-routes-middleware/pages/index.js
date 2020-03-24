import fetch from 'isomorphic-unfetch'

const Index = ({ cookie }) => <div>{`Cookie from response: ${cookie}`}</div>

export async function getServerSideProps() {
  const response = await fetch('http://localhost:3000/api/cookies')
  const cookie = response.headers.get('set-cookie')

  return { props: { cookie } }
}

export default Index
