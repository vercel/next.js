export default function Another() {
  return 'another page'
}

export const getServerSideProps = ({ locale }) => ({
  props: {
    locale,
    hello: 'world',
    gsspData: true,
  },
})
