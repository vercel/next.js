'use client'

import { MenuAlt2Icon, XIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import React from 'react'

const MobileNavContext = React.createContext<
  [boolean, React.Dispatch<React.SetStateAction<boolean>>] | undefined
>(undefined)

export function MobileNavContextProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [isOpen, setIsOpen] = React.useState(false)
  return (
    <MobileNavContext.Provider value={[isOpen, setIsOpen]}>
      {children}
    </MobileNavContext.Provider>
  )
}

export function useMobileNavToggle() {
  const context = React.useContext(MobileNavContext)
  if (context === undefined) {
    throw new Error(
      'useMobileNavToggle must be used within a MobileNavContextProvider'
    )
  }
  return context
}

export function MobileNavToggle({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useMobileNavToggle()

  return (
    <>
      <button
        type="button"
        className="group absolute right-0 top-0 flex h-14 items-center gap-x-2 px-4 lg:hidden"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="font-medium text-gray-100 group-hover:text-gray-400">
          Menu
        </div>
        {isOpen ? (
          <XIcon className="block w-6 text-gray-300" />
        ) : (
          <MenuAlt2Icon className="block w-6 text-gray-300" />
        )}
      </button>

      <div
        className={clsx('overflow-y-auto lg:static lg:block', {
          'fixed inset-x-0 bottom-0 top-14 bg-gray-900': isOpen,
          hidden: !isOpen,
        })}
      >
        {children}
      </div>
    </>
  )
}
