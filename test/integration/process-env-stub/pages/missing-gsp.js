const MissingGsp = () => {
  return <p>hi there 👋</p>
}

export default MissingGsp

export const getStaticProps = () => {
  console.log(process.env.SECRET)
  return {
    props: {
      hi: 'there',
    },
  }
}
