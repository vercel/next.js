import { useAmp } from 'next/amp'

export const config = {
  amp: 'hybrid',
}

export const getStaticProps = () => {
  return {
    props: {
      hello: 'hello',
      random: Math.random(),
    },
  }
}

export const getStaticPaths = () => ({
  paths: ['/blog/post-1', '/blog/post-2'],
  fallback: false,
})

export default ({ hello, random }) => (
  <>
    <p id="use-amp">useAmp: {useAmp() ? 'yes' : 'no'}</p>
    <p id="hello">{hello}</p>
    <p id="random">{random}</p>
  </>
)
