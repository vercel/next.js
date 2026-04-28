/// Extract the convention base name (e.g. `"proxy"`, `"middleware"`) from a
/// filename.
///
/// Returns the segment before the first dot — NOT what `file_stem()` returns.
/// `file_stem()` only strips the last extension, which is wrong here: with a
/// compound `pageExtensions` entry like `"page.ts"`, the file `proxy.page.ts`
/// has `file_stem() == Some("proxy.page")`, but its convention base name is
/// `"proxy"`.
///
/// This must stay in lockstep with the TypeScript
/// `getConventionFileBaseName` helper used by the webpack build path (see
/// `packages/next/src/build/get-convention-file-base-name.ts`). Any change
/// here needs the same change there.
pub fn convention_file_base_name(file_name: &str) -> &str {
    file_name.split('.').next().unwrap_or(file_name)
}
