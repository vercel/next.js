# Fast Refresh had to perform full reload

#### Why This Error Occurred

Fast Refresh had to perform a full reload when you edited a file. It may be because:

- The file you're editing might have other exports in addition to a React component.
- Your React component is an anonymous function.

#### Possible Ways to Fix It

- Move your other exports to a separate file.
- Use a named function for your React component.

### Useful Links

[Fast Refresh documentation](https://nextjs.org/docs/basic-features/fast-refresh)
