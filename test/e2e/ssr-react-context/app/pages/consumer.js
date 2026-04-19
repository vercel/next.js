import React from 'react'

const NumberContext = React.createContext(0)

export default function page() {
  return (
    <NumberContext.Provider value={12345}>
      <NumberContext.Consumer>
        {(value) => <p>Value: {value}</p>}
      </NumberContext.Consumer>
    </NumberContext.Provider>
  )
}

export async function getServerSideProps() {
  return { props: {} }
}
