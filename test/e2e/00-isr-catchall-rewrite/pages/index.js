export default function Home() {
  return 'index page'
}

export const getServerSideProps = ({ locale }) => ({
  props: {
    locale,
    hello: 'world',
    gsspData: true,
  },
})
