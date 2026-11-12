// Natural ordering used when serializing snapshot keys.
declare module 'natural-compare' {
  function naturalCompare(a: string, b: string): number
  export = naturalCompare
}
