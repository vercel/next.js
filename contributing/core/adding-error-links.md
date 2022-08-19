# Adding Warning and Error Descriptions

In Next.js we have a system to add helpful links to warnings and errors.

This allows for the logged message to be short while giving a broader description and instructions on how to solve the warning/error.

In general, all warnings and errors added should have these links attached.

Below are the steps to add a new link:

1. Run `pnpm new-error` which will create the error document and update the manifest automatically.
2. Add the following url to your warning/error:
   `https://nextjs.org/docs/messages/<file-path-without-dotmd>`.

   For example, to link to `errors/api-routes-static-export.md` you use the url:
   `https://nextjs.org/docs/messages/api-routes-static-export`
