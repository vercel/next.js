export function getStaticProps() {
  return {
    props: {
      hello: undefined,
    },
  }
}

export default function Page(props) {
  return <p>index page</p>
}
