exports.up = async function (sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS todos (
        id SERIAL PRIMARY KEY NOT NULL,
        text CHARACTER VARYING(255) NOT NULL,
        done BOOLEAN NOT NULL DEFAULT FALSE
    )
  `;
};

exports.down = async function (sql) {
  await sql`
    DROP TABLE IF EXISTS todos
  `;
};
