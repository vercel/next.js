import { useState } from 'react'
import { Fabric } from 'office-ui-fabric-react/lib-commonjs/Fabric'
import {
  DefaultButton,
  PrimaryButton
} from 'office-ui-fabric-react/lib-commonjs/Button'
import {
  Dialog,
  DialogType,
  DialogFooter
} from 'office-ui-fabric-react/lib-commonjs/Dialog'

export default () => {
  const [isOpen, setIsOpen] = useState(false)
  const openDialog = () => setIsOpen(true)
  const closeDialog = () => setIsOpen(false)
  return (
    <Fabric>
      <p>Welcome to next.js!</p>
      <DefaultButton primary onClick={openDialog}>
        Open Dialog
      </DefaultButton>
      <Dialog
        hidden={!isOpen}
        onDismiss={closeDialog}
        dialogContentProps={{
          type: DialogType.normal,
          title: 'Test Dialog'
        }}
        modalProps={{
          isBlocking: true
        }}
      >
        <p>This is a test dialog.</p>
        <DialogFooter>
          <PrimaryButton onClick={closeDialog} text='OK' />
          <DefaultButton onClick={closeDialog} text='Cancel' />
        </DialogFooter>
      </Dialog>
    </Fabric>
  )
}
