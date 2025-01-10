import Router from 'next/router'

const RedirectPage = () => {
  return <h1>Redirect Page</h1>
}

RedirectPage.getInitialProps = (context) => {
  const { req, res } = context
  if (req) {
    res.writeHead(302, { Location: '/normal' })
    res.end()
  } else {
    Router.push('/normal')
  }
  return {}
}

export default RedirectPage
