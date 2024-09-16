const assert = require("assert");
const express = require("express");
const path = require("path");

const app = express();

function customImplementation() {}

app.engine("pug", customImplementation);
app.set("view engine", "pug");
app.set("views", path.join(__dirname, "fixtures", "pug"));

app.render(
  "index",
  {
    title: "Consolidate.js",
  },
  function (err, rendered) {
    if (err) throw err;
    assert.ok(rendered === undefined);
  }
);
