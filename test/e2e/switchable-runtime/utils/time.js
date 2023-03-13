export default function Time() {
  let time

  if (typeof window !== 'undefined') {
    // We have to make sure it matches the existing markup when hydrating.
    time = document.getElementById('__time').textContent
  } else {
    time = 'Time: ' + Date.now()
  }

  return <span id="__time">{time}</span>
}
