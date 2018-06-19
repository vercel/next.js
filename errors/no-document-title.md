# Title not allowed in _document.js

#### Why This Error Occurred

Setting `<title>` in `_document.js` is a bad idea, since then it's only server rendered, but we also do client routing. 

#### Possible Ways to Fix It

Move `<title>` to `_app.js`
