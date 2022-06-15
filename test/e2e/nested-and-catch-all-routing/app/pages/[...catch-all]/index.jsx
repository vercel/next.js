import { useRouter } from 'next/router'

export default function Page() {
  return <p id="page">{useRouter().route}</p>
}

export async function getStaticProps() {
  return { props: {} }
}

export async function getStaticPaths() {
  return {
    paths: [{ params: { 'catch-all': ['one', 'one'] } }],
    fallback: false,
  }
}
