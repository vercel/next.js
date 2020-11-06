import Link from 'next/link'
import Trans from 'next-translate/Trans'
import useTranslation from 'next-translate/useTranslation'
import Layout from '../components/Layout'

export default function Home() {
  const { t } = useTranslation()

  return (
    <Layout>
      <main>
        <Trans
          i18nKey="home:title"
          components={[
            <h1 className="title" />,
            <a href="https://nextjs.org">Next.js!</a>,
          ]}
        />

        <p className="description">
          {t('home:description')} <code>_pages/index.js</code>
        </p>

        <div className="grid">
          <Link href="/" locale="en">
            <div className="card">
              <h3>{t('home:english')}</h3>
              <p>{t('home:change-english')}</p>
            </div>
          </Link>

          <Link href="/" locale="ca">
            <div className="card">
              <h3>{t('home:catalan')}</h3>
              <p>{t('home:change-catalan')}</p>
            </div>
          </Link>

          <a href="https://nextjs.org/docs" className="card">
            <h3>Next.js &rarr;</h3>
            <p>{t('home:next-docs')}</p>
          </a>

          <a
            href="https://github.com/vinissimus/next-translate"
            className="card"
          >
            <h3>Learn &rarr;</h3>
            <p>{t('home:plugin-docs')}</p>
          </a>
        </div>
      </main>

      <style jsx>{`
        .title a {
          color: #0070f3;
          text-decoration: none;
        }

        .title a:hover,
        .title a:focus,
        .title a:active {
          text-decoration: underline;
        }

        .title {
          margin: 0;
          line-height: 1.15;
          font-size: 4rem;
        }

        .title,
        .description {
          text-align: center;
        }

        .description {
          line-height: 1.5;
          font-size: 1.5rem;
        }

        code {
          background: #fafafa;
          border-radius: 5px;
          padding: 0.75rem;
          font-size: 1.1rem;
          font-family: Menlo, Monaco, Lucida Console, Liberation Mono,
            DejaVu Sans Mono, Bitstream Vera Sans Mono, Courier New, monospace;
        }

        .grid {
          display: flex;
          align-items: center;
          justify-content: center;
          flex-wrap: wrap;

          max-width: 800px;
          margin-top: 3rem;
        }

        .card {
          margin: 1rem;
          flex-basis: 45%;
          padding: 1.5rem;
          text-align: left;
          color: inherit;
          text-decoration: none;
          border: 1px solid #eaeaea;
          border-radius: 10px;
          transition: color 0.15s ease, border-color 0.15s ease;
          cursor: pointer;
        }

        .card:hover,
        .card:focus,
        .card:active {
          color: #0070f3;
          border-color: #0070f3;
        }

        .card h3 {
          margin: 0 0 1rem 0;
          font-size: 1.5rem;
        }

        .card p {
          margin: 0;
          font-size: 1.25rem;
          line-height: 1.5;
        }

        @media (max-width: 600px) {
          .grid {
            width: 100%;
            flex-direction: column;
          }
        }
      `}</style>
    </Layout>
  )
}
