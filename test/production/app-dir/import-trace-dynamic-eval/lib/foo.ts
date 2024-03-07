import Ajv from 'ajv'

export function foo() {
  new Ajv().compile({ type: 'string' })
}
