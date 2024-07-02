/* Create todo table in your neon project */
CREATE TABLE IF NOT EXISTS todos (
        id SERIAL PRIMARY KEY NOT NULL,
        text CHARACTER VARYING(255) NOT NULL,
        done BOOLEAN NOT NULL DEFAULT FALSE
    )

/* Remove todo table from your neon project */
DROP TABLE IF EXISTS todos

    