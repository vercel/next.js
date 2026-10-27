#!/bin/bash
# Rejected by: check-patch.mjs. Committing .next/types makes the globals
# resolve on a clean clone, but generated output must not be committed, and
# the committed copy goes stale the next time a route changes.
set -euo pipefail
./node_modules/.bin/next typegen
sed -i "s#LayoutProps<'/(marketing)'>#LayoutProps<'/'>#" 'app/(marketing)/layout.tsx'
sed -i "s#getDoc(slug)#getDoc(slug.join('/'))#" 'app/docs/[...slug]/page.tsx'
sed -i 's#^\.next/$#.next/*\n!.next/types/#' .gitignore
