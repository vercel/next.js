# Rendering Without Starting Slash

#### Why This Error Occurred

When calling `app.render(req, res, path)` the `path` did not begin with a slash (`/`). This causes unexpected behavior and should be corrected.

#### Possible Ways to Fix It

Make sure the `path` being passed to `app.render` always starts with a slash (`/`)
