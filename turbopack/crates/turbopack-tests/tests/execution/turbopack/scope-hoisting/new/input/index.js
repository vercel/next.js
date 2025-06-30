// import * as betterAuth from "better-auth";
// import * as betterAuth from "better-auth/dist/shared/better-auth.L2-Rkk2U.mjs";

// import * as betterAuth from "better-auth/dist/shared/better-auth.BVR0McvJ.mjs";

// import { mcp } from "better-auth/plugins";
// import Database from "better-sqlite3";

// console.log(betterAuth);

// import { Kysely } from "kysely";
// import { SchemaModule } from "kysely";
import { parseAliasedExpression } from './kysely/dist2/esm/parser/expression-parser.js'

const createKyselyAdapter = async () => {
  // const { BunSqliteDialect } = await import("./bun-sqlite-dialect.mjs");
  // console.log(BunSqliteDialect);
  import('./auth2.js')
  console.log(Kysely, parseAliasedExpression)
}

export { createKyselyAdapter }

export const auth = 1
// betterAuth({
//   // database: new Database("./auth.db"),
//   baseURL: "http://localhost:3000",
//   // plugins: [
//   // 	mcp({
//   // 		loginPage: "/login",
//   // 	}),
//   // ],
//   emailAndPassword: {
//     enabled: true,
//   },
// });
