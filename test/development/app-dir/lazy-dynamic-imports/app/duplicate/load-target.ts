export async function loadTarget() {
  return (await import('./target')).value
}
