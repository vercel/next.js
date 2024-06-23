import { UIErrorTemplate } from './ui-error-template'

export default function NotFound() {
  return (
    <UIErrorTemplate
      pageTitle="404: This page could not be found."
      title="404"
      subtitle="This page could not be found."
    />
  )
}
