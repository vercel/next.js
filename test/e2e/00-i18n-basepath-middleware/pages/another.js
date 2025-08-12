export default function Another() {
  return 'another page'
}

export const getStaticProps = ({ locale }) => ({
  props: {
    locale,
    hello: 'world',
  },
  revalidate: 1,
})
