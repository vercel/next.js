import { useState } from 'react'

export default function Home({ book }) {
  const [reviews, setReviews] = useState(null)

  const handleGetReviews = () => {
    // Client-side request are mocked by `mocks/browser.js`.
    fetch('/reviews')
      .then((res) => res.json())
      .then(setReviews)
  }

  return (
    <div>
      <img src={book.imageUrl} alt={book.title} width="250" />
      <h1>{book.title}</h1>
      <p>{book.description}</p>
      <button onClick={handleGetReviews}>Load reviews</button>
      {reviews && (
        <ul>
          {reviews.map((review) => (
            <li key={review.id}>
              <p>{review.text}</p>
              <p>{review.author}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export async function getServerSideProps() {
  // Server-side requests are mocked by `mocks/server.js`.
  const res = await fetch('https://my.backend/book')
  const book = await res.json()

  return {
    props: {
      book,
    },
  }
}
