const Page = ({ message }) => {
  return (
    <>
      <h1>Personalized Page using SSR</h1>

      <div>
        This is the personalized page. Try also reloading the page to trigger
        server side rendering.
      </div>

      <div>{message}</div>
    </>
  )
}

export function getServerSideProps(ctx) {
  const { parseCookies } = require('nookies')
  const { COOKIE_NAME } = require('./api/cookie')

  const cookies = parseCookies(ctx)
  let message = ''

  if (!cookies[COOKIE_NAME]) {
    message = 'auth required'
    // you could redirect to a different page instead
    ctx.res.writeHeader(307, { Location: '/auth-required' })
    ctx.res.end()
    return
  } else if (cookies[COOKIE_NAME] !== 'my_token') {
    // here you should check the token is valid
    message = 'invalid token'
  } else {
    // everything is fine
    message = 'message from the backend'
  }

  return { props: { message } }
}

export default Page
