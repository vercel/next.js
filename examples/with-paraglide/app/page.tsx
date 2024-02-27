import * as m from "@/paraglide/messages.js";

export function generateMetadata() {
  return {
    title: m.homepage_title(),
    description: m.homepage_description(),
  };
}

export default function Home() {
  return (
    <main>
      <h1>{m.homepage_title()}</h1>
    </main>
  );
}
