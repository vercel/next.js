;(self as any)._ENTRIES ||= {}
const modProm: Promise<any> = import('MODULE' as any)
modProm.catch(() => {})
;(self as any)._ENTRIES['VAR_ENTRY_NAME'] = new Proxy(modProm, {
  get(innerModProm: Promise<any>, name: any) {
    if (name === 'then') {
      return (res: any, rej: any) => innerModProm.then(res, rej)
    }
    let result: any = (...args: any[]) =>
      innerModProm.then((mod: any) => (0, (mod as any)[name])(...args))
    result.then = (res: any, rej: any) =>
      innerModProm.then((mod: any) => (mod as any)[name]).then(res, rej)
    return result
  },
})
