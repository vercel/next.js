function Dynamic () {
  return <div />
}

Dynamic.getInitialProps = () => {
  return { title: 'Dynamic Title' }
}

export default Dynamic

export function Head ({ title }) {
  return (
    <>
      <title>{title}</title>
    </>
  )
}
