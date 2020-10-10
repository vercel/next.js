import { useState } from 'react'

export default function Home({ book, inProduction }) {
  const [reviews, setReviews] = useState(null)

  const handleGetReviews = () => {
    // Client-side request are mocked by `mocks/browser.js`.
    fetch('/reviews')
      .then((res) => res.json())
      .then(setReviews)
  }

  if (inProduction) {
    return (
      <div>
        <p>
          This example does not work in production, as MSW is not intended for
          use in production. In a real-world app, your request will hit the
          actual backend instead.
        </p>
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
        inProduction: true,
      },
    }
  }
}
