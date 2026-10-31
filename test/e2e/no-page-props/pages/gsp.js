export default function Gsp() {
  return <p id="gsp">getStaticProps</p>
}

export const getStaticProps = () => {
  return {
    props: {
      hello: 'world',
    },
  }
}
