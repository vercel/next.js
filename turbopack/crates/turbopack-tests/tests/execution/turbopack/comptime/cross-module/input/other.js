export const SOME_VALUE = 'x'

const node_env = process.env.NODE_ENV
const development_ent = 'development'

export const IS_DEV = node_env === development_ent

export const NO_CONSTANT = globalThis.foo
