import { NextResponse } from 'next/server'
import { useCases, notUsingEval, usingEval } from './lib/utils'
import {
  usingWebAssemblyCompile,
  usingWebAssemblyInstantiate,
  usingWebAssemblyInstantiateWithBuffer,
} from './lib/wasm'

export async function middleware(request) {
  if (request.nextUrl.pathname === `/${useCases.eval}`) {
    return new Response(null, {
      headers: { data: JSON.stringify(await usingEval()) },
    })
  }

  if (request.nextUrl.pathname === `/${useCases.noEval}`) {
    return new Response(null, {
      headers: { data: JSON.stringify(await notUsingEval()) },
    })
  }

  if (request.nextUrl.pathname === `/${useCases.wasmCompile}`) {
    return new Response(null, {
      headers: { data: JSON.stringify(await usingWebAssemblyCompile(9)) },
    })
  }

  if (request.nextUrl.pathname === `/${useCases.wasmInstanciate}`) {
    return new Response(null, {
      headers: { data: JSON.stringify(await usingWebAssemblyInstantiate(9)) },
    })
  }

  if (request.nextUrl.pathname === `/${useCases.wasmBufferInstanciate}`) {
    return new Response(null, {
      headers: {
        data: JSON.stringify(await usingWebAssemblyInstantiateWithBuffer(9)),
      },
    })
  }

  return NextResponse.next()
}

export const config = {
  matcher: Object.values(useCases).map((route) => `/${route}`),
}
