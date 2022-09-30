import React from 'react'
import 'reflect-metadata'
import { container, singleton } from 'tsyringe'

@singleton()
class HelloService {
  getHello() {
    return 'Hello, world!'
  }
}

const helloService = container.resolve(HelloService)

export default function Home() {
  const message = helloService.getHello()

  return <p id="message">{message}</p>
}

export function getServerSideProps() {
  return {
    props: {
      now: Date.now(),
    },
  }
}
