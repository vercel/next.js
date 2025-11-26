import { AsyncLocalStorage } from 'node:async_hooks'

export interface TestReqInfo {
  url: string
  proxyPort: number
  testData: string
}

export interface TestRequestReader<R> {
  url(req: R): string
  header(req: R, name: string): string | null
}

const testStorage = new AsyncLocalStorage<TestReqInfo>()

function extractTestInfoFromRequest<R>(
  req: R,
  reader: TestRequestReader<R>
): TestReqInfo | undefined {
  const proxyPortHeader = reader.header(req, 'next-test-proxy-port')
  if (!proxyPortHeader) {
    return undefined
  }
  const url = reader.url(req)
  const proxyPort = Number(proxyPortHeader)
  const testData = reader.header(req, 'next-test-data') || ''
  return { url, proxyPort, testData }
}

export function withRequest<R, T>(
  req: R,
  reader: TestRequestReader<R>,
  fn: () => T
): T {
  const testReqInfo = extractTestInfoFromRequest(req, reader)
  if (!testReqInfo) {
    return fn()
  }
  return testStorage.run(testReqInfo, fn)
}

export function getTestReqInfo<R>(
  req?: R,
  reader?: TestRequestReader<R>
): TestReqInfo | undefined {
  const testReqInfo = testStorage.getStore()
  if (testReqInfo) {
    return testReqInfo
  }
  if (req && reader) {
    return extractTestInfoFromRequest(req, reader)
  }
  return undefined
}
