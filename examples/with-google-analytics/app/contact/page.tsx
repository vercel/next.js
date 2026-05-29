"use client";
import { useRef, type FormEvent } from "react";
import Page from "../../components/Page";
import { sendGTMEvent } from "@next/third-parties/google";

export default function About() {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    sendGTMEvent({ event: "message submit", value: inputRef.current?.value });
    inputRef.current!.value = "";
  };

  return (
    <Page>
      <h1>This is the Contact page</h1>
      <form onSubmit={handleSubmit}>
        <label>
          <span>Message:</span>
          <textarea ref={inputRef} />
        </label>
        <button type="submit">submit</button>
      </form>
    </Page>
  );
}
