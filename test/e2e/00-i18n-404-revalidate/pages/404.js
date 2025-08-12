export default function NotFound() {
  return 'not found page'
}

export const getStaticProps = () => {
  return {
    props: {
      random: Math.random() + Date.now(),
      hello: 'world',
    },
    revalidate: 1,
  }
}
