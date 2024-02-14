import Head from "next/head";
import Form from "@/components/form";

export default function Contact() {
  return (
    <>
      <Head>
        <title>Contact</title>
      </Head>
      <div>
        <h1>This is the Contact page</h1>
        <Form />
      </div>
    </>
  );
}
