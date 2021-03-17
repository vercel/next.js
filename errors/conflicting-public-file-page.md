# Conflicting Public File and Page File

#### Why This Error Occurred

One of your public files has the exact same path as a page file which is not supported. Since only one resource can reside at the URL both public files and page files must be unique.

#### Possible Ways to Fix It

Rename either the public file or page file that is causing the conflict.

Example conflict between public file and page file

```
public/
  hello
pages/
  hello.js
```

Non-conflicting public file and page file

```
public/
  hello.txt
pages/
  hello.js
```

### Useful Links

- [Static file serving docs](https://nextjs.org/docs/basic-features/static-file-serving)
