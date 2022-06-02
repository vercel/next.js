import React from 'react'
import Head from 'next/head'
import useTranslation from 'next-translate/useTranslation'

export default function Layout(props) {
  const { t } = useTranslation()

  return (
    <div className="container">
      <Head>
        <title>{t('common:title')}</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      {props.children}

      <footer>
        <span>{t('common:powered')} </span>
        <a href="https://vercel.com" target="_blank" rel="noopener noreferrer">
          ▲ vercel
        </a>
        <span>&amp;</span>
        <a
          href="https://github.com/vinissimus/next-translate"
          target="_blank"
          rel="noopener noreferrer"
        >
          next-translate
        </a>
      </footer>

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

        .container {
          min-height: 100vh;
          padding: 0 0.5rem;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
        }

        main {
          padding: 5rem 0;
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
        }

        footer {
          width: 100%;
          height: 100px;
          border-top: 1px solid #eaeaea;
          display: flex;
          justify-content: center;
          align-items: center;
        }

        footer * {
          margin-right: 0.5rem;
        }

        footer a:hover {
          text-decoration: underline dashed #0070f3;
          text-underline-position: under;
        }

        footer a {
          color: inherit;
          text-decoration: none;
        }

        .logo {
          height: 1em;
        }
      `}</style>
    </div>
  )
}
