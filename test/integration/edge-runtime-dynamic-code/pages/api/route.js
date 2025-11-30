import { notUsingEval, usingEval } from '../../lib/utils'
import {
  usingWebAssemblyCompile,
  usingWebAssemblyInstantiate,
  usingWebAssemblyInstantiateWithBuffer,
} from '../../lib/wasm'

export default async function handler(request) {
  const useCase = request.nextUrl.searchParams.get('case')

  if (useCase === 'using-eval') {
    return Response.json(await usingEval())
  }

  if (useCase === 'not-using-eval') {
    return Response.json(await notUsingEval())
  }

  if (useCase === 'using-webassembly-compile') {
    return Response.json(await usingWebAssemblyCompile(9))
  }

  if (useCase === 'using-webassembly-instantiate') {
    return Response.json(await usingWebAssemblyInstantiate(9))
  }

  if (useCase === 'using-webassembly-instantiate-with-buffer') {
    return Response.json(await usingWebAssemblyInstantiateWithBuffer(9))
  }

  return Response.json({ ok: true })
}

export const config = { runtime: 'edge' }
