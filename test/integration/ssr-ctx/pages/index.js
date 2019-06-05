import React from 'react'

const Idk = React.createContext(null)

const Page = () => {
  return (
    <div>
      <Idk.Provider value='hello world'>
        <Idk.Consumer>{idk => <p>Value: {idk}</p>}</Idk.Consumer>
      </Idk.Provider>
    </div>
  )
}

export default Page
