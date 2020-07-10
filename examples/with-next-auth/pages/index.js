import Nav from '../components/nav'
import Footer from '../components/footer'

const NextAuth = () => (
  <>
    <Nav />
    <main>
      <h1>NextAuth.js Demo</h1>
      <p>
        This is an example project that uses{' '}
        <a href={`https://www.npmjs.com/package/next-auth`}>next-auth</a>.
      </p>
      <p>
        See <a href="https://next-auth.js.org">next-auth.js.org</a> for more
        information and documentation. A more full fledged example can be found
        at{' '}
        <a href="https://next-auth-example.now.sh">next-auth-example.now.sh</a>
      </p>
      <p>
        This live demo uses an in-memory database which is automatically erased
        after ~2 hours. More permanent user databases, etc. can be easily
        created by defining a db connector your .env file, see{' '}
        <a href="https://next-auth.js.org/configuration/database">docs</a>
      </p>
    </main>
    <Footer />
  </>
)

export default NextAuth
