interface IConsole {
  assert: Console['assert']
  count: Console['count']
  debug: Console['debug']
  dir: Console['dir']
  error: Console['error']
  info: Console['info']
  log: Console['log']
  time: Console['time']
  timeEnd: Console['timeEnd']
  timeLog: Console['timeLog']
  trace: Console['trace']
  warn: Console['warn']
}

declare const console: IConsole

export { console };
