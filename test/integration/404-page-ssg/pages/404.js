export const getStaticProps = () => ({ props: { hello: 'world' } })

const page = () => `custom 404 page ${Math.random()}`
export default page
