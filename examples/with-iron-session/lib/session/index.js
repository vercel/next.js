// this file is a wrapper with defaults to be used in both API routes and `getServerSideProps` functions
import withIronSession from 'next-iron-session'

export default function withSession(handler) {
  return withIronSession(handler, {
    // The password in this example is in plain text (inside `now.json`) for ease of deployment and understanding.
    // ⚠️ Do not reuse the same password, create a different password for you and store it in a secret management system
    // Example for Zeit's now: https://vercel.com/docs/v2/serverless-functions/env-and-secrets
    password: process.env.SECRET_COOKIE_PASSWORD,
    cookieOptions: {
      // the next line allows to use the session in non-https environements like
      // Next.js dev mode (http://localhost:3000)
      secure: process.env.NODE_ENV === 'production' ? true : false,
    },
  })
}
