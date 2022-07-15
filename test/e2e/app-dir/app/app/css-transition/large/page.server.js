import Link from 'next/link'
import './style.css'

export async function getServerSideProps() {
  await new Promise((resolve) => setTimeout(resolve, 2000))
  return {
    props: {
      message: 'hello from large page',
    },
  }
}

export default function SlowPage(props) {
  return (
    <div>
      <h1>{props.message}</h1>
      <Link href="/css-transition/red">red page</Link>
    </div>
  )
}
