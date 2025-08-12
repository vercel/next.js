export default function Index({ content }) {
  return <h1>{content.title}</h1>
}

export async function getStaticProps() {
  return {
    props: {
      content: { title: 'Index' },
    },
  }
}
