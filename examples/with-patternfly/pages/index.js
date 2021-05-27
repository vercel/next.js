import { useState } from 'react'
import { Button, Wizard } from '@patternfly/react-core'
import { CogIcon } from '@patternfly/react-icons'

const steps = [
  { name: 'Step 1', component: <p>Step 1</p> },
  { name: 'Step 2', component: <p>Step 2</p> },
  { name: 'Step 3', component: <p>Step 3</p> },
  { name: 'Step 4', component: <p>Step 4</p> },
  { name: 'Review', component: <p>Review Step</p>, nextButtonText: 'Finish' },
]

export default function Home() {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <>
      <Button
        variant="primary"
        onClick={() => setIsOpen(true)}
        style={{ margin: 20 }}
        icon={<CogIcon />}
      >
        Show Wizard
      </Button>
      {isOpen && (
        <Wizard
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          title="Simple Wizard"
          description="Simple Wizard Description"
          steps={steps}
        />
      )}
    </>
  )
}
