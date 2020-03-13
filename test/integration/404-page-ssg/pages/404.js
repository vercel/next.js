export const getStaticProps = () => ({
  props: { hello: 'world', random: Math.random() },
})

const page = ({ random }) => `custom 404 page ${random}`
export default page
