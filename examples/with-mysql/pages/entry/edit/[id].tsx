import Container from '@/components/container'
import Nav from '@/components/nav'
import EditEntryForm from '@/components/edit-entry-form'

export default function EditEntryPage() {
  return (
    <>
      <Nav title="Edit" />
      <Container>
        <EditEntryForm />
      </Container>
    </>
  )
}
