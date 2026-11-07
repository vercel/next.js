import SignupForm from "./signup-form";

export default function Home() {
  return (
    <main className="min-h-screen px-6 py-16">
      <div className="mx-auto max-w-xl">
        <div className="mb-10">
          <p className="mb-2 text-sm font-semibold">zod-form-action</p>

          <h1 className="text-4xl font-bold">
            React 19 + Zod + useActionState
          </h1>

          <p className="mt-4 text-gray-600">
            A minimal Next.js example showing typed field errors, server-side
            validation, and framework-safe redirects.
          </p>
        </div>

        <SignupForm />
      </div>
    </main>
  );
}
