'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { myAction } from './server'

export default function Page() {
  const router = useRouter()
  const [text, setText] = useState('initial')

  useEffect(() => {
    let count = 1
    const myActionWrapped = async () => {
      const id = count++
      console.log('myAction()', `[call number ${id}]`)

      await myAction()
      console.log('-> myAction() finished', `[call number ${id}]`)
    }
    Promise.all([myActionWrapped(), myActionWrapped()]).then(() =>
      setText('actions finished')
    )
    setTimeout(() => {
      console.log(`router.replace('?')`)
      router.replace('?')
    })
  }, [router])

  return <>{text}</>
}
