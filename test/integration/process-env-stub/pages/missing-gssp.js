const MissingGssp = () => {
  return <p>hi there 👋</p>
}

export default MissingGssp

export const getServerSideProps = () => {
  console.log(process.env.SECRET)
  return {
    props: {
      hi: 'there',
    },
  }
}
