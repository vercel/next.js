export default function Home() {
  return <p className="title">Welcome Page A</p>
}

export const getServerSideProps = () => ({
  props: {
    abtest: true,
  },
})
