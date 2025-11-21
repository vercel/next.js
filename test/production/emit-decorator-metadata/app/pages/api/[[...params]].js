import 'reflect-metadata'
import { container, singleton } from 'tsyringe'

@singleton()
class HelloService {
  getHello() {
    return 'Hello, world!'
  }
}

const helloService = container.resolve(HelloService)

export default function handler(req, res) {
  res.status(200).json({ message: helloService.getHello() })
}
