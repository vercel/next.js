import { useState } from 'react'

const ClientSideComponent = () => (
  <>
    <style jsx>
      {`
        .title {
          font-size: 24px;
          color: green;
        }
      `}
    </style>
    <p className="title">This is rendered on client-side</p>
  </>
)

const Home = () => {
  const [isVisible, setVisibility] = useState(false)

  const toggleVisibility = () => {
    setVisibility((prevState) => !prevState)
  }

  return (
    <>
      <style jsx>
        {`
          .title {
            font-size: 24px;
          }
        `}
      </style>
      <p className="title">Styled-JSX with Content Security Policy</p>
      <button onClick={toggleVisibility}>Toggle</button>
      {isVisible ? <ClientSideComponent /> : null}
    </>
  )
}

export default Home
