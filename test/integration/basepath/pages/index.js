import { useRouter } from 'next/router'

export const getStaticProps = () => {
  return {
    props: {
      nested: false,
      hello: 'hello',
    },
  }
}

export default function Index({ hello, nested }) {
  const { query, pathname, asPath } = useRouter()
  return (
    <>
      <p id="nested">{nested ? 'yes' : 'no'}</p>
      <p id="prop">{hello} world</p>
      <p id="query">{JSON.stringify(query)}</p>
      <p id="pathname">{pathname}</p>
      <p id="as-path">{asPath}</p>
    </>
  )
}
