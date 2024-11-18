const assert = require("assert");
var express = require("express"),
  cons = require("consolidate"),
  app = express();

// assign the swig engine to .html files
app.engine("html", cons.swig);

// set .html as the default extension
app.set("view engine", "html");
app.set("views", __dirname + "/fixtures" + "/html");

app.render(
  "index",
  {
    title: "Consolidate.js",
  },
  function (err, rendered) {
    assert.ok(rendered.startsWith("<h1>Consolidate.js</h1>"));
  }
);
