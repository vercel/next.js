import { useState, useEffect } from 'react'

const Header = () => {
  const [objState, setObjState] = useState({ name: 'World' })

  useEffect(() => {
    setObjState({ name: 'World' })
  }, [])

  return (
    <header>
      <h1>Hello {objState.name} !</h1>
    </header>
  )
}

Header.whyDidYouRender = true

export default Header
