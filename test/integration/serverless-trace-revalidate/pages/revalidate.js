export const getStaticProps = () => {
  return {
    props: {
      hello: 'hello world',
      random: Math.random(),
    },
    revalidate: 10,
  }
}

export default ({ hello, random }) => (
  <>
    <p id="hello">{hello}</p>
    <p id="random">{random}</p>
  </>
)
