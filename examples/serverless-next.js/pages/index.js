import { useState, useEffect } from 'react'
import Head from 'next/head'

export default function Home() {
  const [me, setMe] = useState()
  const [you, setYou] = useState()

  useEffect(() => {
    ;[
      { url: 'https://api.ipify.org?format=json', setter: setYou },
      { url: 'api/me', setter: setMe },
    ].forEach(({ url, setter }) => {
      fetch(url)
        .then((response) => response.json())
        .then(({ ip }) => setter(ip))
    })
  }, [])

  return (
    <div className="container">
      <Head>
        <title>serverless-next.js example</title>
      </Head>

      <main>
        <img className="serverless-logo" src="/serverless-nextjs-logo.gif" />

        {me && you && (
          <p className="welcome-message">
            Nice to meet you {you}. I'm {me}.
          </p>
        )}
      </main>

      <style jsx>{`
        main {
          display: flex;
          align-items: center;
          justify-content: center;
          flex-direction: column;
          height: 100vh;
        }

        .serverless-logo {
          width: 400px;
        }

        .welcome-message {
          margin-top: 10vh;
          padding-bottom: 20vh;
          font-size: 1.2em;
        }
      `}</style>

      <style jsx global>{`
        html,
        body {
          padding: 0;
          margin: 0;
          font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto,
            Oxygen, Ubuntu, Cantarell, Fira Sans, Droid Sans, Helvetica Neue,
            sans-serif;
        }

        * {
          box-sizing: border-box;
        }
      `}</style>
    </div>
  )
}
