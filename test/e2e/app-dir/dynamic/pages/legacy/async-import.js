import dynamic from 'next/dynamic'

const AsyncImportTarget = dynamic(() => import('../../ui/async-import-target'))

export default function Page() {
  return <AsyncImportTarget />
}
