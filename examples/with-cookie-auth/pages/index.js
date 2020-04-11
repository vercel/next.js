import Link from 'next/link'

const Home = () => {
  const deleteCookie = () => {
    fetch('/api/cookie', {
      method: 'DELETE',
    })
  }

  const createCookie = async () => {
    const response = await fetch('/api/cookie', {
      method: 'POST',
      // body: JSON.stringify(values),  here you could send login and password
      headers: {
        'Content-Type': 'application/json',
      },
    })
    if (!response.ok) {
      // handle error
    }
  }

  return (
    <>
      <h1>Cookie-based authentication example</h1>

      <p>Steps to test the functionality:</p>

      <ol>
        <li>
          Try going into the{' '}
          <Link href="/personalized-swr">
            <a>personalized page</a>
          </Link>{' '}
          that uses client side rendering. You should see an error
        </li>
        <li>
          Click this button to{' '}
          <button onClick={createCookie}>get your cookie</button> (this could be
          a form that sends credentials to the API)
        </li>
        <li>
          Go to the{' '}
          <Link href="/personalized-swr">
            <a>personalized page</a>
          </Link>{' '}
          again, it should work
        </li>
        <li>
          With this button you can{' '}
          <button onClick={deleteCookie}>clear the cookie</button> (logout).
          Note that this also makes an api call because the cookie is set as
          http only, to protect it.
        </li>
        <li>
          You can also check{' '}
          <Link href="personalized-ssr">
            <a>this page that uses SSR</a>
          </Link>
        </li>
      </ol>
    </>
  )
}

export default Home
