import { inngest } from "@/inngest/inngest.config";
import { redirect } from "next/navigation";

export default function Home() {
  async function triggerInngestEvent() {
    "use server";
    await inngest.send({
      name: "test/hello.world",
      data: {
        message: "Hello from Next.js!",
      },
    });
    redirect("http://localhost:8288/stream");
  }
  return (
    <main>
      <div>
        <form action={triggerInngestEvent}>
          <button type="submit">Trigger Your Inngest Function</button>
        </form>
      </div>
    </main>
  );
}
