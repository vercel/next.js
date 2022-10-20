const assert = require("assert");
const express = require("express");
const path = require("path");

const app = express();

app.engine("pug", require("pug").__express);
app.set("view engine", "pug");
app.set("views", "./fixtures/pug");

app.render(
  "index",
  {
    title: "Consolidate.js",
  },
  function (err, rendered) {
    assert.ok(rendered.includes("<h1>Consolidate.js</h1>"));
  }
);
