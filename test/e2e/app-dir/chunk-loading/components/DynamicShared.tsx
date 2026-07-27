import dynamic from 'next/dynamic'

const DynamicSuperShared = dynamic(
  async () => {
    const module = await import('./SuperShared')
    return module.SuperShared
  },
  {
    loading: () => <div>loading...</div>,
  }
)

export function DynamicShared() {
  return <DynamicSuperShared from="dynamic" />
}
