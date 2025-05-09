"use client";

export default function ClientComponent() {
  console.log("BUNDLER2", process.env.__NEXT_BUNDLER);
  return (
    <div>
      <h1>Hello from Client Component</h1>
      <p>This is a client component.</p>
    </div>
  );
}
