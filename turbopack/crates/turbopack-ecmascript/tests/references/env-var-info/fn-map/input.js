// TODO track arguments and mark FOOBAR as read
globalThis.blackbox = (v) => ({ DECOY: v.FOOBAR })

const v = blackbox(process.env).DECOY
console.log(v)
