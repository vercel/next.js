export default withApp(
  withAuth(
    class Something extends React.Component {
      render() {
        const { props, stats } = this

        const test = props.url
      }
    }
  )
)
