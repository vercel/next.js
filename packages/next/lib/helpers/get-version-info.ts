import type { Readable } from 'stream'

export async function getVersionInfo(): Promise<any> {
  try {
    const response = await fetch('https://registry.npmjs.org/next', {
      headers: {
        accept:
          'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*',
      },
    })
    const body = response.body as Readable | ReadableStream | null
    if (!body) throw new Error('TODO')
    let _body: string = ''
    let error: any
    const decoder = new TextDecoder()
    if (body instanceof ReadableStream) {
      const value = (await body.getReader().read())?.value
      _body = decoder.decode(value?.slice(0, 100))
    } else {
      body.on('error', (err: any) => {
        error = err
      })

      const chunk = body.read()
      if (chunk) {
        _body = decoder.decode(chunk)
      }
    }

    const re = /"latest":"(?<latest>.*)","canary":"(?<canary>.*)","next-/
    if (error) throw error

    const match = _body.match(re)
    if (!match?.groups) throw new Error('TODO')
    return { latest: match.groups.latest, canary: match.groups.canary }
  } catch (error) {
    console.error(error)
  }
}
