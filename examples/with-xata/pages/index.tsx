import { InferGetServerSidePropsType } from 'next'
import { getXataClient } from '../utils/xata.codegen'

const pushDummyData = async () => {
  const response = await fetch('/api/write-links-to-xata')

  if (response.ok) {
    window?.location.reload()
  }
}

const IndexPage = ({
  links,
}: InferGetServerSidePropsType<typeof getServerSideProps>) => (
  <main>
    <header>
      <img src="/flap.gif" />
      <h1>
        Next.js with<span aria-hidden>&#8209;</span>xata
      </h1>
    </header>
    <article>
      {links.length > 1 ? (
        <ul>
          {links.map(({ title, url, description }) => (
            <li key={url}>
              <a href={url} rel="noopener" target="_blank">
                {title}
              </a>
              <p>{description}</p>
            </li>
          ))}
        </ul>
      ) : (
        <section>
          <h2>No records found.</h2>
          <strong>
            Create a `nextjs_with_xata_example` and push some useful links to
            see them here.
          </strong>
          <button
            type="button"
            onClick={() => {
              pushDummyData()
            }}
          >
            Push records to Xata
          </button>
        </section>
      )}
    </article>
    <footer>
      <span>
        Made by{' '}
        <a href="https://xata.io" rel="noopener" target="_blank">
          <object data="/xatafly.svg" />
        </a>
      </span>
    </footer>
  </main>
)

export const getServerSideProps = async () => {
  const xata = await getXataClient()
  const links = await xata.db.nextjs_with_xata_example.getAll()
  return {
    props: {
      links,
    },
  }
}

export default IndexPage
