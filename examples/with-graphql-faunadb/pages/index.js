import Head from 'next/head'
import { getGuestbookEntries } from '../graphql/api'
import Footer from '../components/Footer'
import Hero from '../components/Hero'

const Guestbook = props => {
  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta charSet="utf-8" />
        <link
          rel="shortcut icon"
          type="image/x-icon"
          href="/static/favicon.png"
        />
      </Head>
      <style jsx global>{`
        body {
          margin: 0px;
          padding: 0px;
        }
      `}</style>
      <div>
        <Hero initialEntries={props.initialEntries} />
        <Footer />
      </div>
      <style jsx>{`
        div {
          display: flex;
          margin-left: auto;
          margin-right: auto;
          font-family: sans-serif, sans;
          flex-direction: column;
          align-items: center;
        }
      `}</style>
    </>
  )
}

Guestbook.getInitialProps = async function() {
  const initialEntries = await getGuestbookEntries()
  return {
    initialEntries: initialEntries.data.entries.data.reverse(),
  }
}

export default Guestbook
