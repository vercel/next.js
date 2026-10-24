export async function loadExternalValue() {
  return (await import('../../linked/input.loader.js?external-root')).default
}
