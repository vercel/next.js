export const getStaticProps = () => {
  const data = { maybe: 'yes' }
  return {
    props: {
      data: JSON.stringify(data),
    },
  }
}

export default ({ data }) => (
  <div>
    <p>Should error during export</p>
    <p>{data}</p>
  </div>
)
