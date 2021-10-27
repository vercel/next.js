export async function getServerSideProps() {
  return {
    props: {
      myDynamicProp: 'hello world',
    },
  }
}

export default function FullyDynamic({ myDynamicProp }) {
  return <h1>{myDynamicProp}</h1>
}
