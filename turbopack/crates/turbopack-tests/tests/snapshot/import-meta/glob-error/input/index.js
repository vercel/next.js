// Error: 'as' option is not supported
const withAs = import.meta.glob('./dir/*.js', { as: 'raw' })

// Error: non-constant eager
const nonConstEager = import.meta.glob('./dir/*.js', { eager: someVar })

// Error: unknown option
const unknown = import.meta.glob('./dir/*.js', { exhaust: true })

console.log(withAs, nonConstEager, unknown)
