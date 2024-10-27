import { useRouter } from 'next/router'

export default function Page(props) {
  return (
    <>
      <p>hello from ssg</p>
      <p id="query">{JSON.stringify(useRouter().query)}</p>
    </>
  )
}

export function getStaticProps() {
  if (!process.env.LEGACY_ENV_KEY) {
    throw new Error('missing env key LEGACY_ENV_KEY!!')
  }
  return {
    props: {},
  }
}
