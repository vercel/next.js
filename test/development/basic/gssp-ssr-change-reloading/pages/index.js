import { useRouter } from 'next/router'
import data from '../lib/data.json'

export default function Gsp(props) {
  if (useRouter().isFallback) {
    return 'Loading...'
  }

  return (
    <>
      <p id="change">change me</p>
      <p id="props">{JSON.stringify(props)}</p>
    </>
  )
}

export const getStaticProps = async () => {
  const count = 1

  return {
    props: {
      count,
      data,
      random: Math.random(),
    },
  }
}
