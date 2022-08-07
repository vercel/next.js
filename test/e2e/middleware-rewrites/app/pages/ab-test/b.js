export default function Home() {
  return <p className="title">Welcome Page B</p>
}

export const getServerSideProps = () => ({
  props: {
    abtest: true,
  },
})
