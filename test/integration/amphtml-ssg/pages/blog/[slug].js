import { useAmp } from 'next/amp'

export const config = {
  amp: 'hybrid',
}

export const getStaticProps = (ctx) => {
  return {
    props: {
      slug: ctx.params?.slug || null,
      hello: 'hello',
      random: Math.random(),
    },
  }
}

export const getStaticPaths = () => ({
  paths: ['/blog/post-1', '/blog/post-2'],
  fallback: false,
})

export default ({ hello, random, slug }) => (
  <>
    <p id="use-amp">useAmp: {useAmp() ? 'yes' : 'no'}</p>
    <p id="hello">{hello}</p>
    <p id="random">{random}</p>
    <p id="slug">{slug}</p>
  </>
)
