import { inngest } from "../inngest.client";

export const helloWorld = inngest.createFunction(
  { id: "hello-world", name: "Hello World" },
  { event: "test/hello.world" },
  async ({ event, step }) => {
    await step.sleep("sleep for a second", "1s");
    return { event, body: event.data.message };
  },
);
