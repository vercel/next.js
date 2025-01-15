import { SharedClienta } from '../shared-client-a'
import { SharedClientb } from '../shared-client-b'
import { OnlyPage1a } from './only-page1-a'
import { OnlyPage1b } from './only-page1-b'
import { RSC } from '../shared-rsc'

export default function Page() {
  return (
    <div>
      My Page 1
      <SharedClienta />
      <SharedClientb />
      <OnlyPage1a />
      <OnlyPage1b />
      <RSC />
    </div>
  )
}
