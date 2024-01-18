const fs = require("fs");

if (fs.existsSync("../.env")) {
  fs.copyFileSync("../.env", ".env.development");
} else if (fs.existsSync("../.env.local")) {
  fs.copyFileSync("../.env.local", ".env.development");
} else {
  throw new Error("No .env or .env.local file found at root of the project");
}
