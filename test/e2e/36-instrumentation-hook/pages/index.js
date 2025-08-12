export default function Home(props) {
  return `isOdd: ${props.isOdd}`
}

export async function getServerSideProps() {
  return {
    props: {
      isOdd: globalThis.isOdd ? globalThis.isOdd(2) : 'unknown',
    },
  }
}
