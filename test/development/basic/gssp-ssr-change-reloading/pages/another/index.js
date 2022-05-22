import { useRouter } from 'next/router'

export default function Gsp(props) {
  if (useRouter().isFallback) {
    return 'Loading...'
  }

  return (
    <>
      <p id="change">change me</p>
      <p id="props">{JSON.stringify(props)}</p>
      <div style={{ height: 1000, width: 50, background: 'cyan' }}></div>
      <p id="scroll-target">bottom</p>
    </>
  )
}

export const getStaticProps = async () => {
  const count = 1

  return {
    props: {
      count,
      random: Math.random(),
    },
  }
}
