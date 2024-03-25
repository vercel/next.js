import { Tigris } from "@tigrisdata/core";
import { TodoItem } from "../db/models/todoItems";

async function main() {
  // setup client
  const tigrisClient = new Tigris();
  // ensure branch exists, create it if it needs to be created dynamically
  await tigrisClient.getDatabase().initializeBranch();
  // register schemas
  await tigrisClient.registerSchemas([TodoItem]);
}

main();
