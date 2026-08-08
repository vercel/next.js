export async function getStaticProps() {
  return {
    props: {
      message: 'Hello from sitemap getStaticProps',
    },
  }
}

export default function Sitemap({ message }) {
  return <h1 id="message">{message}</h1>
}
