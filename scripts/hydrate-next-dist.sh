#!/usr/bin/env bash
# Populates packages/next/dist (and packages/next-env/dist, which the
# workspace `next` package resolves via its `@next/env` dependency) from
# published tarballs instead of building locally. Used by deploy tests, which
# deploy the published NEXT_TEST_VERSION anyway and only need dist for the
# local test harness (e.g. `next/dist/trace` imports in test/lib).
set -euo pipefail

version="${1:?usage: hydrate-next-dist.sh <version|dist-tag|tarball-url>}"

case "$version" in
  http*) next_spec="$version" ;;
  *) next_spec="next@$version" ;;
esac

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

# When the preview-builds npm mirror is auth-protected, fetching its tarballs
# needs credentials (see `writeMirrorNpmrcIfNecessary` in
# test/lib/next-modes/next-deploy.ts, which does the same for the remote
# install). Point npm at an npmrc with a read token scoped to the mirror so
# `npm pack` can authenticate; registry fetches are unaffected.
if [[ -n "${PREVIEW_BUILDS_READ_TOKEN:-}" ]]; then
  base_url="${NEXT_TEST_PREVIEW_BUILDS_BASE_URL:-https://vercel-packages.vercel.app/next}"
  registry_key="//${base_url#*://}"
  registry_key="${registry_key%/}/"
  echo "${registry_key}:_authToken=${PREVIEW_BUILDS_READ_TOKEN}" > "$tmpdir/npmrc"
  export NPM_CONFIG_USERCONFIG="$tmpdir/npmrc"
fi

# Extracts the published tarball for $1 into a fresh directory, moves its
# dist/ to $2, and leaves the extracted package dir path in $extracted_pkg.
hydrate() {
  local spec="$1"
  local dest="$2"
  local pkgdir tarball
  pkgdir="$(mktemp -d "$tmpdir/pkg.XXXXXX")"
  tarball="$(cd "$pkgdir" && npm pack "$spec" --silent | tail -n1)"
  tar -xzf "$pkgdir/$tarball" -C "$pkgdir" package
  rm -rf "$dest"
  mv "$pkgdir/package/dist" "$dest"
  extracted_pkg="$pkgdir/package"
  echo "hydrated $dest from $spec"
}

hydrate "$next_spec" packages/next/dist

# `@next/env` is a workspace dependency of `next`; resolve it from the packed
# `next` package. Published versions pin an exact version, while preview
# tarballs (scripts/create-preview-tarballs.js) rewrite the dependency to a
# tarball URL on the preview-builds mirror.
next_env_dep="$(node -e "console.log(require(process.argv[1]).dependencies['@next/env'])" "$extracted_pkg/package.json")"
case "$next_env_dep" in
  http*) next_env_spec="$next_env_dep" ;;
  *) next_env_spec="@next/env@$next_env_dep" ;;
esac
hydrate "$next_env_spec" packages/next-env/dist
