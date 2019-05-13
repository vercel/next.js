'use strict';

const express = require('express');
const bodyParser = require('body-parser');

const app = express();
module.exports = app;

app.use(bodyParser.json());

app.all('*', (req, res) => {
    res.set('Content-Type', 'application/json');
    res.status(200).send(JSON.stringify({test: 'wow, it works!!!'}));
});