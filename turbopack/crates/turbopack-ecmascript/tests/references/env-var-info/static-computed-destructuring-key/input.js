const key = 'version'
const { [key]: v } = process
foo(v)
const {
  ['env']: { FOO1 },
} = process
console.log(FOO1)
