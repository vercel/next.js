export function printAndExit(message: string, code = 1) {
  if (code === 0) {
    // tslint:disable-next-line no-console
    console.log(message)
  } else {
    console.error(message)
  }

  process.exit(code)
}
