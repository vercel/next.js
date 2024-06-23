import { UIErrorTemplate } from './ui-error-template'

export default function Forbidden() {
  return (
    <UIErrorTemplate
      pageTitle="403: This page is forbidden."
      title="403"
      subtitle="This page is forbidden."
    />
  )
}
