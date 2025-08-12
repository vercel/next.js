export default function NotFound({ content }) {
  return <h1>{content.title}</h1>
}

export async function getStaticProps() {
  return {
    props: {
      content: { title: 'custom 404' },
    },
  }
}
