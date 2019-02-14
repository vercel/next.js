const isInteractive = process.stdout.isTTY

export function clearConsole() {
  if (!isInteractive) {
    return
  }

  // Push the user's current terminal output off the screen prior to erase
  for (let row = 0; row < process.stdout.rows!; ++row) {
    process.stdout.write(process.platform === 'win32' ? '\r\n' : '\n')
  }

  // \x1B: control terminal
  //    [2J: erase entire display
  //    [0f: move to line 0 (win32)
  //    [H: go home (nix)
  process.stdout.write(
    process.platform === 'win32' ? '\x1B[2J\x1B[0f' : '\x1B[2J\x1B[H',
  )
}
