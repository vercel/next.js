'use client'

import Link from 'next/link'

export function OptionsPopover({ section }: { section: string }) {
  const menuId = 'options-menu'

  return (
    <>
      <button popoverTarget={menuId}>{section} options</button>
      <div id={menuId} popover="auto">
        <p>{section} actions</p>
        <Link href={section === 'Settings' ? '/profile' : '/settings'}>
          Switch section
        </Link>
      </div>
    </>
  )
}
