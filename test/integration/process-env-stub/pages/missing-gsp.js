export default () => {
  return <p>hi there 👋</p>
}

export const getStaticProps = () => {
  console.log(process.env.SECRET)
  return {
    props: {
      hi: 'there',
    },
  }
}
