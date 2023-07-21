import { CreateUserAction } from "./Actions.js";

(async () => {
  await CreateUserAction("John");
  console.log("created user John");
})();
