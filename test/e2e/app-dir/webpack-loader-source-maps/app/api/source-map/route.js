import { inspect } from 'node:util'
import { throwFirst } from '../../../first.mapped.js'
import { throwSecond } from '../../../second.mapped.js'
import { throwPlain } from '../../../plain.js'

const probes = {
  first: throwFirst,
  second: throwSecond,
  plain: throwPlain,
}

export function GET(request) {
  const probe = new URL(request.url).searchParams.get('probe')
  try {
    probes[probe]()
  } catch (error) {
    return Response.json({ message: error.message, stack: inspect(error) })
  }
}
