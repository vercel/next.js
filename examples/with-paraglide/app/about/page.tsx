import * as m from "@/paraglide/messages.js";

export function generateMetadata() {
  return {
    title: m.about_page_title(),
  };
}

export default function Home() {
  return (
    <main>
      <h1>{m.about_page_title()}</h1>
    </main>
  );
}
