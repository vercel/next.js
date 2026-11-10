if (typeof window !== 'undefined') {
  throw new Error('fail module evaluation')
}

const Index = () => 'hi'

Index.getInitialProps = () => ({})

export default Index
