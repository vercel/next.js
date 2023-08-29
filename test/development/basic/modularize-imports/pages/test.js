// import { Menu } from '@headlessui/react/dist/components/menu/menu'
import { Menu } from '@headlessui/react'
import { library } from '@fortawesome/fontawesome-svg-core'
import { faCheck } from '@fortawesome/free-solid-svg-icons'
import { Float } from '@headlessui-float/react'
// import { Listbox as List1 } from '@headlessui/react/dist/components/listbox/listbox'
import { Listbox } from '@headlessui/react'
import { fas } from '@fortawesome/free-solid-svg-icons'
import { Toaster } from 'react-hot-toast'
import { IceCream } from 'lucide-react'

function useExport(exportedSymbol) {
  return typeof exportedSymbol
}

export default function SlowComponent() {
  return (
    <ul>
      <li>@headlessui/react {useExport(Menu)}</li>
      <li>@fortawesome/fontawesome-svg-core {useExport(library)}</li>
      <li>@fortawesome/free-solid-svg-icons {useExport(faCheck)}</li>
      <li>@headlessui-float/react {useExport(Float)}</li>
      <li>@headlessui/react {useExport(Listbox)}</li>
      <li>react-hot-toast {useExport(Toaster)}</li>
      <li>@fortawesome/free-solid-svg-icons {useExport(fas)}</li>
      <li>lucide-react {useExport(IceCream)}</li>
    </ul>
  )
}
