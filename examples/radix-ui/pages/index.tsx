import { useState } from 'react'
import {
  HamburgerMenuIcon,
  DotFilledIcon,
  CheckIcon,
  ChevronRightIcon,
} from '@radix-ui/react-icons'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'

function RightSlot({ children }) {
  return (
    <div className="ml-auto pl-4 text-gray-500 group-hover:text-gray-200">
      {children}
    </div>
  )
}

function DropdownMenuItem({ children, ...props }) {
  return (
    <DropdownMenu.Item
      {...props}
      className={
        'group bg-white hover:bg-gray-700 hover:text-gray-200 text-xs rounded flex items-center h-6 px-1 pl-6 relative select-none' +
        (props.disabled ? ' text-gray-500' : '')
      }
    >
      {children}
    </DropdownMenu.Item>
  )
}

function DropdownMenuCheckboxItem({ children, ...props }) {
  return (
    <DropdownMenu.CheckboxItem
      {...props}
      className="group bg-white hover:bg-gray-700 hover:text-gray-200 text-xs rounded flex items-center h-6 px-1 pl-6 relative select-none"
    >
      {children}
    </DropdownMenu.CheckboxItem>
  )
}

function DropdownMenuItemIndicator({ children, ...props }) {
  return (
    <DropdownMenu.ItemIndicator
      {...props}
      className="absolute left-0 w-6 inline-flex items-center justify-center"
    >
      {children}
    </DropdownMenu.ItemIndicator>
  )
}

function Separator() {
  return <DropdownMenu.Separator className="h-[1px] bg-gray-300 m-1" />
}

function DropdownMenuRadioItem({
  children,
  ...props
}: {
  children: React.ReactNode
  value: string
}) {
  return (
    <DropdownMenu.RadioItem
      {...props}
      className="bg-white hover:bg-gray-700 hover:text-gray-200 text-xs rounded flex items-center h-6 px-1 pl-6 relative select-none"
    >
      {children}
    </DropdownMenu.RadioItem>
  )
}

export default function Home() {
  const [bookmarksChecked, setBookmarksChecked] = useState(true)
  const [urlsChecked, setUrlsChecked] = useState(false)
  const [person, setPerson] = useState('pedro')
  return (
    <div className="h-screen w-full flex flex-col space-y-4 items-center justify-center bg-gradient-to-r from-cyan-500 to-blue-500">
      <h1 className="text-6xl text-white font-semibold">
        Radix UI + Tailwind CSS
      </h1>
      <h1 className="text-4xl text-white font-semibold">Click me!</h1>

      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          asChild
          className="bg-white text-xs rounded-3xl flex items-center h-8 px-2 relative select-none"
        >
          <button
            aria-label="Customise options"
            className="h-8 w-8 inline-flex items-center justify-center shadow-lg"
          >
            <HamburgerMenuIcon />
          </button>
        </DropdownMenu.Trigger>

        <DropdownMenu.Content
          sideOffset={5}
          className="bg-white rounded p-1 shadow-lg"
        >
          <DropdownMenuItem>
            New Tab <RightSlot>⌘+T</RightSlot>
          </DropdownMenuItem>
          <DropdownMenuItem>
            New Window <RightSlot>⌘+N</RightSlot>
          </DropdownMenuItem>
          <DropdownMenuItem disabled>
            New Private Window <RightSlot>⇧+⌘+N</RightSlot>
          </DropdownMenuItem>
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger className="group bg-white hover:bg-gray-700 hover:text-gray-200 hover:border-0 text-xs rounded flex items-center h-6 px-1 pl-6 relative select-none">
              More Tools
              <RightSlot>
                <ChevronRightIcon />
              </RightSlot>
            </DropdownMenu.SubTrigger>
            <DropdownMenu.SubContent
              sideOffset={2}
              alignOffset={-5}
              className="bg-white rounded p-1 shadow-lg"
            >
              <DropdownMenuItem>
                Save Page As… <RightSlot>⌘+S</RightSlot>
              </DropdownMenuItem>
              <DropdownMenuItem>Create Shortcut…</DropdownMenuItem>
              <DropdownMenuItem>Name Window…</DropdownMenuItem>
              <Separator />
              <DropdownMenuItem>Developer Tools</DropdownMenuItem>
            </DropdownMenu.SubContent>
          </DropdownMenu.Sub>
          <Separator />
          <DropdownMenuCheckboxItem
            checked={bookmarksChecked}
            onCheckedChange={setBookmarksChecked}
          >
            <DropdownMenuItemIndicator>
              <CheckIcon />
            </DropdownMenuItemIndicator>
            Show Bookmarks <RightSlot>⌘+B</RightSlot>
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={urlsChecked}
            onCheckedChange={setUrlsChecked}
          >
            <DropdownMenuItemIndicator>
              <CheckIcon />
            </DropdownMenuItemIndicator>
            Show Full URLs
          </DropdownMenuCheckboxItem>
          <Separator />
          <DropdownMenu.Label className="pl-6 leading-6 text-xs text-gray-700">
            Contributors
          </DropdownMenu.Label>

          <DropdownMenu.RadioGroup value={person} onValueChange={setPerson}>
            <DropdownMenuRadioItem value="pedro">
              <DropdownMenuItemIndicator>
                <DotFilledIcon />
              </DropdownMenuItemIndicator>
              Pedro Sanchez
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="pablo">
              <DropdownMenuItemIndicator>
                <DotFilledIcon />
              </DropdownMenuItemIndicator>
              Pablo Sanchez
            </DropdownMenuRadioItem>
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </div>
  )
}
