const express = require('express');
const next = require('next');
const nextI18NextMiddleware = require('next-i18next/middleware');

const nextI18next = require('../i18n');

const port = process.env.PORT || 3000
const app = next({dev: process.env.NODE_ENV !== 'production'});
const handle = app.getRequestHandler();

(async () => {
    await app.prepare();
    const server = express();

    // use the next-i18next middleware with our i18n configuration
    try {
        server.use(nextI18NextMiddleware(nextI18next))
    } catch (e) {
        console.log(e)
    }

    // handle nextjs routing
    server.get('*', (req, res) => handle(req, res));

    await server.listen(port)
    console.log(`🚀 Ready on http://localhost:${port}`) // eslint-disable-line no-console
})();
