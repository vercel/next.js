import React from 'react'
import { Text, TextContainer } from 'react-md'

export default function Home() {
  return (
    <TextContainer>
      <Text type="headline-4">Hello, world!</Text>
    </TextContainer>
     <div className="container">
      <h1>Hello Next.js</h1>
      <p>Let's explore different ways to style Next.js apps</p>
      <style jsx>{`
        .container {
          margin: 50px;
        }
        p {
          color: blue;
        }
      `}</style>
    </div>
  )
}
