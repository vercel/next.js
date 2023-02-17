/* eslint-disable @typescript-eslint/no-unused-vars */
const blah: boolean = false
// @ts-expect-error ignore the import issue here caused by https://github.com/microsoft/TypeScript/issues/49083
const blah2 = import('../value.ts').then((r) => r.default)

export default () => <h3>Hello TypeScript</h3>
