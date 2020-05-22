export default function Post(props) {
  return (
    <div>
      <h1>My {props.id} blog post</h1>
      <p>
        Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod
        tempor incididunt ut labore et dolore magna aliqua.
      </p>
    </div>
  )
}

export async function getStaticProps({ params: { id } }) {
  return { props: { id } }
}

export async function getStaticPaths() {
  return {
    paths: [
      { params: { id: 'first' } },
      { params: { id: 'second' } },
      { params: { id: 'last' } },
    ],
    fallback: true,
  }
}
