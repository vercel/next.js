export function startTimer({ clock }) {
  clock.start('clock.secondTicked')
}

export function stopTimer({ clock }) {
  clock.stop()
}
