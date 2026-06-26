import useSWR, { useSWRConfig } from 'swr'

export default function Page({ foo }) {
  const { data } = useSWR('hello', (v) => v, { fallbackData: 'hello' })
  useSWRConfig() // call SWR context

  return <div id="content">{`${data}-${foo}`}</div>
}

export function getServerSideProps() {
  return {
    props: {
      foo: 'bar',
    },
  }
}
