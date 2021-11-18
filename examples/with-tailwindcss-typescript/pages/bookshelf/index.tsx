import { GetStaticProps } from 'next'

import { Book } from '../../interfaces'
import Link from '../../components/Link'
import { fetchBooks } from '../../services/books'

const Bookshelf: React.FC<{ books: Book[] }> = ({ books }) => (
  <>
    <h1>Bookshelf</h1>
    <p className="mb-3 italic">
      This example fetches data at build time using{' '}
      <Link href="https://nextjs.org/docs/basic-features/data-fetching#getstaticprops-static-generation">
        getStaticProps()
      </Link>{' '}
      and{' '}
      <Link href="https://nextjs.org/docs/basic-features/data-fetching#getstaticpaths-static-generation">
        getStaticPaths()
      </Link>
      .
    </p>
    <p className="mb-3">
      There are {books.length} magical books on the bookshelf:
    </p>
    <ul className="list-inside list-decimal">
      {books.map((book) => (
        <li key={book.isbn}>
          <Link href="/bookshelf/[isbn]" as={`/bookshelf/${book.isbn}`}>
            {book.title}
          </Link>
        </li>
      ))}
    </ul>
  </>
)

export const getStaticProps: GetStaticProps = async () => {
  const books: Book[] = await fetchBooks()
  return { props: { books } }
}

export default Bookshelf
