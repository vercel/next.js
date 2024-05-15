const dotenv = require("dotenv");
const { parse } = require("pg-connection-string");

dotenv.config({ path: ".env.local" });

const options = parse(process.env.DATABASE_URL || "");

module.exports = options;
