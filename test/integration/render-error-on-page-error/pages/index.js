const Index = () => {
  return 'Hi'
}

export function getServerSideProps() {
  throw new Error('server side props error')
}

export default Index
