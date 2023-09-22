declare module 'CLIENT_MODULE' {
  export const __turbopack_module_id__: string
}

declare module 'CLIENT_CHUNKS' {
  const moduleId: string
  export default moduleId

  export const chunks: any[]
}
