export const getStaticProps = () => ({
  hello: 'world',
})

export const getStaticPaths = () => ({
  fallback: true,
  paths: [],
})

export default () => 'hi'
