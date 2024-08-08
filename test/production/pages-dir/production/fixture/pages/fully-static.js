export async function getStaticProps() {
  return {
    props: {
      myStaticProp: 'hello world',
    },
  }
}

export default function FullyStatic({ myStaticProp }) {
  return <h1>{myStaticProp}</h1>
}
