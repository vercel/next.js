export default function NotFound() {
  return '500 page'
}

export const getStaticProps = () => {
  console.log('/500 getStaticProps')
  return {
    props: {
      random: Math.random(),
      is500: true,
    },
  }
}
