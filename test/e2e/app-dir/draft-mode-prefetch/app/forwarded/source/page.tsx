import { LinkAccordion } from '../../link-accordion'
import { RegisterActions } from '../retained-actions'
import {
  disableDraftMode,
  enableDraftMode,
  enableDraftModeAndRedirect,
} from './actions'

export default function Page() {
  return (
    <>
      <h1>Forwarded source</h1>
      <RegisterActions
        actions={{
          enable: enableDraftMode,
          disable: disableDraftMode,
          enableAndRedirect: enableDraftModeAndRedirect,
        }}
      />
      <LinkAccordion href="/forwarded/action-target" prefetch={false}>
        Forwarded target
      </LinkAccordion>
    </>
  )
}
