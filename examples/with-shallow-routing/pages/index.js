import { useRouter } from 'next/router'
import Link from 'next/link'
import { format } from 'url'

let counter = 0

export async function getServerSideProps() {
  counter++
  return { props: { initialPropsCounter: counter } }
}

export default function Index({ initialPropsCounter }) {
  const router = useRouter()
  const { pathname, query } = router
  const reload = () => {
    router.push(format({ pathname, query }))
  }
  const incrementCounter = () => {
    const currentCounter = query.counter ? parseInt(query.counter, 10) : 0
    const href = `/?counter=${currentCounter + 1}`

    router.push(href, href, { shallow: true })
  }

  return (
    <div>
      <h2>This is the Home Page</h2>
      <Link href="/about">
        <a>About</a>
      </Link>
      <button onClick={reload}>Reload</button>
      <button onClick={incrementCounter}>Change State Counter</button>
      <p>&quot;getServerSideProps&quot; ran for &quot;{initialPropsCounter}&quot; times.</p>
      <p>Counter: &quot;{query.counter || 0}&quot;.</p>
    </div>
  )
}
