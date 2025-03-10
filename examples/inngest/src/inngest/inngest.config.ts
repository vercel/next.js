import { EventSchemas, Inngest } from "inngest";

// TypeScript schema for the events
export type Events = {
  "test/hello.world": {
    name: "test/hello.world";
    data: {
      message: string;
    };
  };
};

// Inngest client to send and receive events
export const inngest = new Inngest({
  id: "demo-app",
  schemas: new EventSchemas().fromRecord<Events>(),
});

// a function to execute, typically in its own file
const helloWorld = inngest.createFunction(
  { id: "hello-world", name: "Hello World" },
  { event: "test/hello.world" },
  async ({ event, step }) => {
    await step.sleep("sleep for a second", "1s");
    return { event, body: event.data.message };
  },
);

// configuration for the Inngest api router
export const inngestConfig = {
  client: inngest,
  functions: [helloWorld],
};
