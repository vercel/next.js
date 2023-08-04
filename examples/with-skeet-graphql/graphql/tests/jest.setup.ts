import { expressServer } from '../src/index'

beforeAll(async () => {})

afterAll(async () => {
  await (await expressServer).close()
})
