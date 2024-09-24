import { Worker } from "@temporalio/worker";
import { URL } from "url";
import path from "path";
import * as activities from "./activities.js";

// Support running both complied code and ts-node/esm loader
const workflowsPath = new URL(
  `./workflows${path.extname(import.meta.url)}`,
  import.meta.url,
).pathname;

const worker = await Worker.create({
  workflowsPath,
  activities,
  taskQueue: "my-nextjs-project",
});

await worker.run();
