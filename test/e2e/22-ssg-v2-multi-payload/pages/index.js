export default () => 'Hi'

export const getStaticProps = () => {
  return {
    props: {
      hello: 'index',
    },
  }
}
