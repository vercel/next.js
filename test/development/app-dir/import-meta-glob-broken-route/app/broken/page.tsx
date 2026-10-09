// `.txt` has no module type, so compiling this route fails.
const mods = import.meta.glob('*.txt', {
  base: '../../content',
  eager: true,
})

export default function Page() {
  return <p>{Object.keys(mods).join(', ')}</p>
}
