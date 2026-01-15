import { Button } from './components/Button'
import { Modal } from './components/Modal'
import { Dropdown } from './components/Dropdown'

export default function Page() {
  return (
    <main>
      <h1>Page with Client Components</h1>
      <Button>Click me</Button>
      <Modal>Modal content</Modal>
      <Dropdown
        items={[
          { label: 'Option 1', value: '1' },
          { label: 'Option 2', value: '2' },
        ]}
      />
    </main>
  )
}
