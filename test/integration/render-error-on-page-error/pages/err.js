const Index = () => {
  if (typeof window === 'undefined') {
    throw new Error('server side render error')
  }
  return 'Hi'
}

export function getServerSideProps() {
  return { props: {} }
}

export default Index
