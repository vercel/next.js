export default function DynamicSlotPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  throw new Error('Triggered slot error in dynamic route')
}
