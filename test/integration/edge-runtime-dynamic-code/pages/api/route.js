import { useCases, notUsingEval, usingEval } from '../../lib/utils'
import {
  usingWebAssemblyCompile,
  usingWebAssemblyInstantiate,
  usingWebAssemblyInstantiateWithBuffer,
} from '../../lib/wasm'

export default async function handler(request) {
  const useCase = request.nextUrl.searchParams.get('case')

  return Response.json(
    useCase === useCases.eval
      ? await usingEval()
      : useCase === useCases.noEval
      ? await notUsingEval()
      : useCase === useCases.wasmCompile
      ? await usingWebAssemblyCompile(9)
      : useCase === useCases.wasmInstanciate
      ? await usingWebAssemblyInstantiate(9)
      : useCase === useCases.wasmBufferInstanciate
      ? await usingWebAssemblyInstantiateWithBuffer(9)
      : { ok: true }
  )
}

export const config = { runtime: 'edge' }
