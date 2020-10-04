export const getStaticPaths = async () => ({
  paths: ['/post/1'],
  fallback: false,
})
export const getStaticProps = async () => ({ props: {} })
export default () => 'blog post'
