export default function InlinePage() {
  async function inlineAction() {
    'use server'
    return { inline: true, message: 'This is an inline action' }
  }

  return (
    <div>
      <form action={inlineAction}>
        <button type="submit">Inline Action</button>
      </form>
    </div>
  )
}
