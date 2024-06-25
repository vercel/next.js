"use client";

import { useFormStatus } from "react-dom";
import { saveData } from "./action";
import { useRef } from "react";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending}>{pending ? "Submitting" : "Submit"}</button>
  );
}

export default function UploadForm() {
  const formRef = useRef<HTMLFormElement | null>(null);

  async function formAction(formData: FormData) {
    await saveData(formData);
    formRef.current?.reset();
    alert("Save success!");
  }

  return (
    <form action={formAction} ref={formRef}>
      <h1>Upload Demo</h1>

      <div>Email</div>
      <input type="email" name="email" required />
      <br />
      <br />

      <div>Select file</div>
      <input type="file" name="file" required />
      <br />
      <br />
      <br />
      <Submit />
    </form>
  );
}
