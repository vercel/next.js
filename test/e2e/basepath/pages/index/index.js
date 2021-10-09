import { useRouter } from 'next/router'

export const getStaticProps = () => {
  return {
    props: {
      nested: true,
      hello: 'hello',
    },
  }
}

export default function Index({ hello, nested }) {
  const { query, pathname } = useRouter()
  return (
    <>
      <p id="nested">{nested ? 'yes' : 'no'}</p>
      <p id="prop">{hello} world</p>
      <p id="query">{JSON.stringify(query)}</p>
      <p id="pathname">{pathname}</p>
    </>
  )
}
