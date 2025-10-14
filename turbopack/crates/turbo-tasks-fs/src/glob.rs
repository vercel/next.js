use std::fmt::Display;

use anyhow::{Result, bail};
use regex::bytes::{Regex, RegexBuilder};
use serde::{Deserialize, Serialize};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{TaskInput, Vc, trace::TraceRawVcs};

use crate::globset::parse;

// Examples:
// - file.js = File(file.js)
// - *.js = AnyFile, File(.js)
// - file*.js = File(file), AnyFile, File(.js)
// - dir/file.js = File(dir), PathSeparator, File(file.js)
// - **/*.js = AnyDirectories, PathSeparator, AnyFile, File(.js)
// - {a/**,*}/file = Alternatives([File(a), PathSeparator, AnyDirectories], [AnyFile]),
//   PathSeparator, File(file)

// Note: a/**/b does match a/b, so we need some special logic about path
// separators

#[turbo_tasks::value(eq = "manual")]
#[derive(Debug, Clone)]
#[serde(into = "GlobForm", try_from = "GlobForm")]
pub struct Glob {
    glob: String,
    #[turbo_tasks(trace_ignore)]
    opts: GlobOptions,
    #[turbo_tasks(trace_ignore)]
    regex: Regex,
    #[turbo_tasks(trace_ignore)]
    directory_match_regex: Regex,
}
impl PartialEq for Glob {
    fn eq(&self, other: &Self) -> bool {
        self.glob == other.glob
    }
}
impl Eq for Glob {}

impl Display for Glob {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Glob({})", self.glob)
    }
}
#[derive(
    Serialize, Deserialize, Copy, Clone, PartialEq, Eq, Hash, Default, TaskInput, TraceRawVcs, Debug,
)]
pub struct GlobOptions {
    /// Whether the glob is a partial match.
    /// Allows glob to match any part of the given string(s).
    /// NOTE: this means that a pattern like `node_modules/package_name` with `contains:true` will
    /// match `foo_node_modules/package_name_bar` If you want to match a _directory_ named
    /// `node_modules/package_name` you should use `**/node_modules/package_name/**`
    pub contains: bool,
}

#[derive(Serialize, Deserialize)]
struct GlobForm {
    glob: String,
    opts: GlobOptions,
}
impl From<Glob> for GlobForm {
    fn from(value: Glob) -> Self {
        Self {
            glob: value.glob,
            opts: value.opts,
        }
    }
}
impl TryFrom<GlobForm> for Glob {
    type Error = anyhow::Error;
    fn try_from(value: GlobForm) -> Result<Self, Self::Error> {
        Glob::parse(&value.glob, value.opts)
    }
}

impl Glob {
    // Returns true if the glob matches the given path.
    pub fn matches(&self, path: &str) -> bool {
        self.regex.is_match(path.as_bytes())
    }

    // Returns true if the glob might match a filename underneath this `path` where the
    // path represents a directory.
    pub fn can_match_in_directory(&self, path: &str) -> bool {
        debug_assert!(
            !path.ends_with('/'),
            "Path should be a directory name and not end with /"
        );
        self.directory_match_regex.is_match(path.as_bytes())
    }

    pub fn parse(input: &str, opts: GlobOptions) -> Result<Glob> {
        let (glob_re, directory_match_re) = parse(input, opts)?;
        let regex = new_regex(glob_re.as_str());
        let directory_match_regex = new_regex(directory_match_re.as_str());

        Ok(Glob {
            glob: input.to_string(),
            opts,
            regex,
            directory_match_regex,
        })
    }
}

impl TryFrom<&str> for Glob {
    type Error = anyhow::Error;

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        Glob::parse(value, GlobOptions::default())
    }
}

#[turbo_tasks::value_impl]
impl Glob {
    #[turbo_tasks::function]
    pub fn new(glob: RcStr, opts: GlobOptions) -> Result<Vc<Self>> {
        Ok(Self::cell(Glob::parse(glob.as_str(), opts)?))
    }

    #[turbo_tasks::function]
    pub async fn alternatives(globs: Vec<Vc<Glob>>) -> Result<Vc<Self>> {
        match globs.len() {
            0 => Ok(Glob::new(rcstr!(""), GlobOptions::default())),
            1 => Ok(globs.into_iter().next().unwrap()),
            _ => {
                let mut new_glob = String::new();
                new_glob.push('{');
                let mut opts = None;
                for (index, glob) in globs.iter().enumerate() {
                    if index > 0 {
                        new_glob.push(',');
                    }
                    let glob = &*glob.await?;
                    if let Some(old_opts) = opts {
                        if old_opts != glob.opts {
                            bail!(
                                "Cannot compose globs with different options via the \
                                 `alternatives` function."
                            )
                        }
                    } else {
                        opts = Some(glob.opts);
                    }
                    new_glob.push_str(&glob.glob);
                }
                new_glob.push('}');
                // The loop must have iterated at least once, so the options must be initialized.
                Ok(Glob::new(new_glob.into(), opts.unwrap()))
            }
        }
    }
}

fn new_regex(pattern: &str) -> Regex {
    RegexBuilder::new(pattern)
        .dot_matches_new_line(true)
        .build()
        .expect("A successfully parsed glob should produce a valid regex")
}

#[cfg(test)]
mod tests {
    use rstest::*;

    use super::Glob;
    use crate::glob::GlobOptions;

    #[rstest]
    #[case::file("file.js", "file.js")]
    #[case::dir_and_file("../public/äöüščří.png", "../public/äöüščří.png")]
    #[case::dir_and_file("dir/file.js", "dir/file.js")]
    #[case::file_braces("file.{ts,js}", "file.js")]
    #[case::dir_and_file_braces("dir/file.{ts,js}", "dir/file.js")]
    #[case::dir_and_file_dir_braces("{dir,other}/file.{ts,js}", "dir/file.js")]
    #[case::star("*.js", "file.js")]
    #[case::dir_star("dir/*.js", "dir/file.js")]
    #[case::globstar("**/*.js", "file.js")]
    #[case::globstar("**/*.js", "dir/file.js")]
    #[case::globstar("**/*.js", "dir/sub/file.js")]
    #[case::globstar("**/**/*.js", "file.js")]
    #[case::globstar("**/**/*.js", "dir/sub/file.js")]
    #[case::globstar("**", "/foo")]
    #[case::globstar("**", "foo")]
    #[case::star("*", "foo")]
    #[case::globstar_in_dir("dir/**/sub/file.js", "dir/sub/file.js")]
    #[case::globstar_in_dir("dir/**/sub/file.js", "dir/a/sub/file.js")]
    #[case::globstar_in_dir("dir/**/sub/file.js", "dir/a/b/sub/file.js")]
    #[case::globstar_in_dir(
        "**/next/dist/**/*.shared-runtime.js",
        "next/dist/shared/lib/app-router-context.shared-runtime.js"
    )]
    #[case::star_dir(
        "**/*/next/dist/server/next.js",
        "node_modules/next/dist/server/next.js"
    )]
    #[case::node_modules_root("**/node_modules/**", "node_modules/next/dist/server/next.js")]
    #[case::node_modules_root_package(
        "**/node_modules/next/**",
        "node_modules/next/dist/server/next.js"
    )]
    #[case::node_modules_nested(
        "**/node_modules/**",
        "apps/some-app/node_modules/regenerate-unicode-properties/Script_Extensions/Osage.js"
    )]
    #[case::node_modules_nested_package(
        "**/node_modules/regenerate-unicode-properties/**",
        "apps/some-app/node_modules/regenerate-unicode-properties/Script_Extensions/Osage.js"
    )]
    #[case::node_modules_pnpm(
        "**/node_modules/**",
        "node_modules/.pnpm/regenerate-unicode-properties@9.0.0/node_modules/\
         regenerate-unicode-properties/Script_Extensions/Osage.js"
    )]
    #[case::node_modules_pnpm_package(
        "**/node_modules/{regenerate,regenerate-unicode-properties}/**",
        "node_modules/.pnpm/regenerate-unicode-properties@9.0.0/node_modules/\
         regenerate-unicode-properties/Script_Extensions/Osage.js"
    )]
    #[case::node_modules_pnpm_prefixed_package(
        "**/node_modules/{@blockfrost/blockfrost-js,@highlight-run/node,@libsql/client,@jpg-store/\
         lucid-cardano,@mikro-orm/core,@mikro-orm/knex,@prisma/client,@sentry/nextjs,@sentry/node,\
         @swc/core,argon2,autoprefixer,bcrypt,better-sqlite3,canvas,cpu-features,cypress,eslint,\
         express,next-seo,node-pty,payload,pg,playwright,postcss,prettier,prisma,puppeteer,rimraf,\
         sharp,shiki,sqlite3,tailwindcss,ts-node,typescript,vscode-oniguruma,webpack,websocket,@\
         aws-sdk/client-dynamodb,@aws-sdk/lib-dynamodb}/**",
        "node_modules/.pnpm/@aws-sdk+lib-dynamodb@3.445.0_@aws-sdk+client-dynamodb@3.445.0/\
         node_modules/@aws-sdk/lib-dynamodb/dist-es/index.js"
    )]
    #[case::alternatives_nested1("{a,b/c,d/e/{f,g/h}}", "a")]
    #[case::alternatives_nested2("{a,b/c,d/e/{f,g/h}}", "b/c")]
    #[case::alternatives_nested3("{a,b/c,d/e/{f,g/h}}", "d/e/f")]
    #[case::alternatives_nested4("{a,b/c,d/e/{f,g/h}}", "d/e/g/h")]
    #[case::alternatives_empty1("react{,-dom}", "react")]
    #[case::alternatives_empty2("react{,-dom}", "react-dom")]
    #[case::alternatives_chars("[abc]", "b")]
    fn glob_match(#[case] glob: &str, #[case] path: &str) {
        let glob = Glob::parse(glob, GlobOptions::default()).unwrap();

        println!("{glob:?} {path}");

        assert!(glob.matches(path));
    }

    #[rstest]
    #[case::early_end("*.raw", "hello.raw.js")]
    #[case::early_end(
        "**/next/dist/esm/*.shared-runtime.js",
        "next/dist/shared/lib/app-router-context.shared-runtime.js"
    )]
    #[case::star("*", "/foo")]
    fn glob_not_matching(#[case] glob: &str, #[case] path: &str) {
        let glob = Glob::parse(glob, GlobOptions::default()).unwrap();

        println!("{glob:?} {path}");

        assert!(!glob.matches(path));
    }

    #[rstest]
    #[case::dir_and_file_partial("dir/file.js", "dir")]
    #[case::dir_star_partial("dir/*.js", "dir")]
    #[case::globstar_partial("**/**/*.js", "dir")]
    #[case::globstar_partial("**/**/*.js", "dir/sub")]
    #[case::globstar_partial("**/**/*.js", "dir/sub/file.js")] // This demonstrates some ambiguity in naming. `file.js` might be a directory name.
    #[case::globstar_in_dir_partial("dir/**/sub/file.js", "dir")]
    #[case::globstar_in_dir_partial("dir/**/sub/file.js", "dir/a")]
    #[case::globstar_in_dir_partial("dir/**/sub/file.js", "dir/a/b")]
    #[case::globstar_in_dir_partial("dir/**/sub/file.js", "dir/a/b/sub")]
    #[case::globstar_in_dir_partial("dir/**/sub/file.js", "dir/a/b/sub/file.js")]
    fn glob_can_match_directory(#[case] glob: &str, #[case] path: &str) {
        let glob = Glob::parse(glob, GlobOptions::default()).unwrap();

        println!("{glob:?} {path}");

        assert!(glob.can_match_in_directory(path));
    }
    #[rstest]
    #[case::dir_and_file_partial("dir/file.js", "dir/file.js")] // even if there was a dir, named `file.js` we know the glob wasn't intended to match it.
    #[case::alternatives_chars("[abc]", "b")]
    fn glob_not_can_match_directory(#[case] glob: &str, #[case] path: &str) {
        let glob = Glob::parse(glob, GlobOptions::default()).unwrap();

        println!("{glob:?} {path}");

        assert!(!glob.can_match_in_directory(path));
    }

    #[rstest]
    #[case::star("*", "/foo")]
    #[case::star("*", "foo")]
    #[case::star("*", "foo/bar")]
    #[case::prefix("foo/*", "bar/foo/baz")]
    // This is a possibly surprising case.
    #[case::dir_match("node_modules/foo", "my_node_modules/foobar")]
    fn partial_glob_match(#[case] glob: &str, #[case] path: &str) {
        let glob = Glob::parse(glob, GlobOptions { contains: true }).unwrap();

        println!("{glob:?} {path}");

        assert!(glob.matches(path));
    }

    #[rstest]
    #[case::literal("foo", "bar")]
    #[case::suffix("*.js", "foo.ts")]
    #[case::prefix("foo/*", "bar")]
    // This is a possibly surprising case
    #[case::dir_match("/node_modules/", "node_modules/")]
    fn partial_glob_not_matching(#[case] glob: &str, #[case] path: &str) {
        let glob = Glob::parse(glob, GlobOptions { contains: true }).unwrap();

        println!("{glob:?} {path}");

        assert!(!glob.matches(path));
    }
}
