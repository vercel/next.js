import { useRouter } from "next/router";

import Container from "@/components/container";
import Nav from "@/components/nav";
import EditEntryForm from "@/components/edit-entry-form";

export default function EditEntryPage() {
  const router = useRouter();
  const { id, title, content } = router.query;
  return (
    <>
      <Nav title="Edit" />
      <Container>
        <EditEntryForm />
      </Container>
    </>
  );
}
