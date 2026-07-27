import { InlineActionButton } from './button'

export default function InlinePage() {
  async function trueInlineAction(value) {
    'use server'
    return { doubled: value * 2 }
  }

  return (
    <div>
      <h1 id="inline-page">Inline Action Test</h1>
      <InlineActionButton action={trueInlineAction} />
    </div>
  )
}
