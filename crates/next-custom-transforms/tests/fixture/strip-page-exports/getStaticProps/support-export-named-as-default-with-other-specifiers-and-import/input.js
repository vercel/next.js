import { useContext, createContext } from 'react'

export const context = createContext()

export function getStaticProps() {
  return { props: {} }
}

function El() {
  const value = useContext(context)
  return <div />
}

const a = 5

export { El as default, a }
