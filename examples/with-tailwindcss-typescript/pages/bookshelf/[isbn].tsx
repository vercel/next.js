import { GetStaticProps, GetStaticPaths } from 'next'
import Image from 'next/image'
import Link from '../../components/Link'

import { Book } from '../../interfaces'
import { fetchBooks } from '../../services/books'

const BookDetail: React.FC<{ book: Book }> = ({ book }) => (
  <>
    <h1>{book.title}</h1>
    <div className="flex mb-6 gap-6">
      <Image src={book.cover.medium} alt="" width="180" height="277" />
      <ul>
        <li>Author: {book.authors[0].name}</li>
        <li>Published: {book.publish_date}</li>
      </ul>
    </div>
    <p>
      <Link href="/bookshelf">Back to the bookshelf</Link>
    </p>
  </>
)

export default BookDetail

export const getStaticPaths: GetStaticPaths = async () => {
  const books = await fetchBooks()
  const paths = books.map((book) => ({
    params: { isbn: book.isbn },
  }))
  return {
    paths,
    fallback: false,
  }
}

export const getStaticProps: GetStaticProps = async ({ params }) => {
  const books = await fetchBooks()
  const isbn = params?.isbn
  const book = books.find((data) => data.isbn === isbn)
  return { props: { book } }
}
