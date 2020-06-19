import { useRouter } from 'next/router'

export const getStaticProps = () => {
  return {
    props: {
      hello: 'hello',
    },
  }
}

export default function Index({ hello }) {
  const { query, pathname } = useRouter()
  return (
    <>
      <p id="prop">{hello} world</p>
      <p id="query">{JSON.stringify(query)}</p>
      <p id="pathname">{pathname}</p>
    </>
  )
}
