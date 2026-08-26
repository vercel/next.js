globalThis.blackbox = (v) => ({ DECOY: v.FOOBAR })

// TODO fix this
const v = blackbox(process.env).DECOY
console.log(v)
