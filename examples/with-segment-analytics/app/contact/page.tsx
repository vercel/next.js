import Form from '@/components/form'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Contact',
}

export default function Contact() {
  return (
    <div>
      <h1>This is the Contact page</h1>
      <Form />
    </div>
  )
}
