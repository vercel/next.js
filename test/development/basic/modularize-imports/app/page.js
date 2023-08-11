import {
  IceCream,
  BackpackIcon,
  LucideActivity,
  Code,
  Menu,
  SortAsc,
  SortAscIcon,
  LucideSortDesc,
  VerifiedIcon,
  CurlyBraces,
  Slash,
  SquareGantt,
  CircleSlashed,
  SquareKanban,
  SquareKanbanDashed,
  Stars,
  Edit,
  Edit2,
  LucideEdit3,
  TextSelection,
  createLucideIcon,
} from 'lucide-react'

const CustomIcon = createLucideIcon('CustomIcon', [
  ['circle', { cx: '16', cy: '4', r: '1', key: '1grugj' }],
  ['path', { d: 'm18 19 1-7-6 1', key: 'r0i19z' }],
  ['path', { d: 'm5 8 3-3 5.5 3-2.36 3.5', key: '9ptxx2' }],
  ['path', { d: 'M4.24 14.5a5 5 0 0 0 6.88 6', key: '10kmtu' }],
  ['path', { d: 'M13.76 17.5a5 5 0 0 0-6.88-6', key: '2qq6rc' }],
])

export default function Page() {
  return (
    <>
      <IceCream />
      <BackpackIcon />
      <LucideActivity />
      <Code />
      <Menu />
      <SortAsc />
      <SortAscIcon />
      <LucideSortDesc />
      <VerifiedIcon />
      <CurlyBraces />
      <Slash />
      <SquareGantt />
      <CircleSlashed />
      <SquareKanban />
      <SquareKanbanDashed />
      <Stars />
      <Edit />
      <Edit2 />
      <LucideEdit3 />
      <TextSelection />
      <CustomIcon />
    </>
  )
}
