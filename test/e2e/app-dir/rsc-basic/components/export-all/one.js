export function One() {
  return 'one'
}

export * from './two'
export { Two as TwoAliased } from './two'
