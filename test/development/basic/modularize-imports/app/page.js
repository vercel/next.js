'use client'

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
import { Tab, RadioGroup, Transition } from '@headlessui/react'

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
      <Tab.Group>
        <Tab.List>
          <Tab>Tab 1</Tab>
          <Tab>Tab 2</Tab>
          <Tab>Tab 3</Tab>
        </Tab.List>
        <Tab.Panels>
          <Tab.Panel>Content 1</Tab.Panel>
          <Tab.Panel>Content 2</Tab.Panel>
          <Tab.Panel>Content 3</Tab.Panel>
        </Tab.Panels>
      </Tab.Group>
      <RadioGroup>
        <RadioGroup.Label>Plan</RadioGroup.Label>
        <RadioGroup.Option value="startup">
          {({ checked }) => <span>{checked ? 'checked' : ''} Startup</span>}
        </RadioGroup.Option>
        <RadioGroup.Option value="business">
          {({ checked }) => <span>{checked ? 'checked' : ''} Business</span>}
        </RadioGroup.Option>
      </RadioGroup>
      <Transition show>I will fade in and out</Transition>
    </>
  )
}
