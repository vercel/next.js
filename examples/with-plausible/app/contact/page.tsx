"use client";

import { FormEvent, useState } from "react";
import { usePlausible } from "next-plausible";

export default function Contact() {
  const [message, setMessage] = useState("");
  const plausible = usePlausible();

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    plausible("customEventName", {
      props: {
        message,
      },
    });

    // your own submit logic
    setMessage("");
  };

  return (
    <div>
      <h1>This is the Contact page</h1>
      <form onSubmit={handleSubmit}>
        <label>
          <span>Message:</span>
          <textarea name="message" />
        </label>
        <button type="submit">submit</button>
      </form>
    </div>
  );
}
