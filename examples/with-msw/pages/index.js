import { useState } from 'react'

export default function Home({ book, error }) {
  const [reviews, setReviews] = useState(null)

  const handleGetReviews = () => {
    // Client-side request are mocked by `mocks/browser.js`.
    // This request will fail in production, as MSW is only run in development.
    // In a real-world app this request would hit the actual backend.
    fetch('/reviews')
      .then((res) => res.json())
      .then(setReviews)
  }

  if (error) {
    return (
      <div>
        <p>Failed to fetch book</p>
      </div>
    )
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
  // This request will fail in production, as MSW is only run in development.
  // In a real-world app this request would hit the actual backend.
  try {
    const res = await fetch('https://my.backend/book')
    const book = await res.json()

    return {
      props: {
        book,
      },
    }
  } catch (error) {
    return {
      props: {
        error: true,
      },
    }
  }
}
