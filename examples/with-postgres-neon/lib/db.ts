import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL as string);

export default sql;
