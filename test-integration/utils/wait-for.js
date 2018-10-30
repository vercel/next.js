export default function waitFor (millis) {
  return new Promise((resolve) => setTimeout(resolve, millis))
}
