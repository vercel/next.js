import Link from 'next/link'
import { useRouter } from 'next/router'

export function getServerSideProps({ params }) {
  return { props: { slug: params.slug, now: Date.now() } }
}

export default function Page(props) {
  const router = useRouter()
  return (
    <>
      <p id="slug">{props.slug}</p>
      <Link id="now" href={router.asPath}>
        {props.now}
      </Link>
    </>
  )
}
