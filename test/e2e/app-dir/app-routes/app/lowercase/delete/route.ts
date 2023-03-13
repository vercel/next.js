export const handler = async (): Promise<Response> => {
  return new Response('hello, world')
}

const del = handler
export { del as delete }
