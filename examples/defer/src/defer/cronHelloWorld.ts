import { defer } from "@defer/client";

async function cronHelloWorld() {
  console.log("Hello world!");
}

export default defer.cron(cronHelloWorld, "0 * * * *");
