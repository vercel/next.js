import cookies from '../../utils/cookies'

const handler = (req, res) => {
  // The cookie middleware will add the `set-cookie` header
  res.cookie('Next.js', 'api-middleware!')
  // Return the `set-cookie` header so we can display it in the browser and show that it works!
  res.end(res.getHeader('Set-Cookie'))
}

export default cookies(handler)
