import useSWR from 'swr'

console.log(useSWR)

export default function Home() {
  return <h1>Hello</h1>
}

export async function getStaticProps() {
  return {
    props: {
      foo: 'bar',
    },
  }
}
