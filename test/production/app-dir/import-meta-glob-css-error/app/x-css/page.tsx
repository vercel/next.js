const mods = import.meta.glob('*.css', {
  base: '../../content',
  eager: true,
})

export default function Page() {
  return <p>{Object.keys(mods).join(', ')}</p>
}
