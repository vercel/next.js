import Link from 'next/link'
import './style.css'

export async function getServerSideProps() {
  await new Promise((resolve) => setTimeout(resolve, 2000))
  return {
    props: {
      message: 'hello from red page',
    },
  }
}

export default function SlowPage(props) {
  return (
    <div>
      <h1>{props.message}</h1>
      <Link href="/css-transition/large">large page</Link>
    </div>
  )
}
