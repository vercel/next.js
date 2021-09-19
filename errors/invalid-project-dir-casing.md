# Invalid Project Directory Casing

#### Why This Error Occurred

When starting Next.js the passed directory was in different casing than the casing the directory is actually in on the filesystem.

This can cause unexpected behavior from failing to resolve files consistently. This can occur when using powershell on Windows and making a typo in a directory's casing while navigating to a project.

#### Possible Ways to Fix It

Ensure the actual casing for the directory is used when navigating/starting the Next.js project. Use a terminal other than Windows powershell.

### Useful Links

- [Next.js CLI documentation](https://nextjs.org/docs/api-reference/cli)
