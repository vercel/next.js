export default () => {
  return <p>hi there 👋</p>
}

export const getServerSideProps = () => {
  console.log(process.env.SECRET)
  return {
    props: {
      hi: 'there',
    },
  }
}
