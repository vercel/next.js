export const getStaticProps = () => {
  return {
    props: {},
  }
}

export const getStaticPaths = () => {
  return {
    paths: [{ params: { rest: ['one'] } }],
    fallback: false,
  }
}

export default function Page() {
  return <p id="top-level-rest">Hello from [...rest]</p>
}
