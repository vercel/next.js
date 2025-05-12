use anyhow::Result;
use globset::{Glob as GlobsetGlob, GlobBuilder, GlobMatcher, GlobSet};
use serde::{Deserialize, Serialize};
use turbo_rcstr::RcStr;
use turbo_tasks::Vc;

// Examples:
// - file.js = File(file.js)
// - *.js = AnyFile, File(.js)
// - file*.js = File(file), AnyFile, File(.js)
// - dir/file.js = File(dir), PathSeparator, File(file.js)
// - **/*.js = AnyDirectories, PathSeparator, AnyFile, File(.js)
// - {a/**,*}/file = Alternatives([File(a), PathSeparator, AnyDirectories], [AnyFile]),
//   PathSeparator, File(file)

#[turbo_tasks::value(eq = "manual")]
#[serde(into = "GlobForm", try_from = "GlobForm")]
#[derive(Clone, Debug)]
pub struct Glob {
    // Store the raw glob strings to support equality and serialization
    raw: Vec<RcStr>,
    #[turbo_tasks(trace_ignore)]
    implementation: GlobImpl,
}
#[derive(Clone, Debug)]
enum GlobImpl {
    Set(GlobSet),
    Single(GlobMatcher),
}

impl GlobImpl {
    fn is_match(&self, path: &str) -> bool {
        match self {
            GlobImpl::Set(glob_set) => glob_set.is_match(path),
            GlobImpl::Single(glob_matcher) => glob_matcher.is_match(path),
        }
    }
}

impl PartialEq for Glob {
    fn eq(&self, other: &Self) -> bool {
        self.raw == other.raw
    }
}
impl Eq for Glob {}

impl Glob {
    pub fn execute(&self, path: &str) -> bool {
        self.implementation.is_match(path)
    }
    fn parse(input: RcStr) -> Result<Glob> {
        let parsed = parse_as_globset_glob(input.as_str())?.compile_matcher();
        Ok(Self {
            raw: vec![input],
            implementation: GlobImpl::Single(parsed),
        })
    }
}

// Small helper to apply our configuration consistently
fn parse_as_globset_glob(input: &str) -> Result<GlobsetGlob> {
    Ok(GlobBuilder::new(input)
        // allow '\' to escape meta characters
        .backslash_escape(true)
        // allow empty alternates '{}', not really desired but this isn't ambiguous and is backwards
        // compatible.
        .empty_alternates(true)
        // Don't allow `* ` or `?` to match `/`
        .literal_separator(true)
        .case_insensitive(false)
        .build()?)
}

// Serialized form of `Glob`
#[derive(Serialize, Deserialize)]
struct GlobForm {
    globs: Vec<RcStr>,
}
impl From<Glob> for GlobForm {
    fn from(value: Glob) -> Self {
        Self { globs: value.raw }
    }
}
impl TryFrom<GlobForm> for Glob {
    type Error = anyhow::Error;

    fn try_from(value: GlobForm) -> Result<Self, Self::Error> {
        if value.globs.len() == 1 {
            return Glob::parse(value.globs[0].clone());
        }
        let mut set = GlobSet::builder();
        for raw in &value.globs {
            set.add(parse_as_globset_glob(raw)?);
        }
        Ok(Glob {
            raw: value.globs,
            implementation: GlobImpl::Set(set.build()?),
        })
    }
}

impl TryFrom<&str> for Glob {
    type Error = anyhow::Error;

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        Glob::parse(value.into())
    }
}

#[turbo_tasks::value_impl]
impl Glob {
    #[turbo_tasks::function]
    pub fn new(glob: RcStr) -> Result<Vc<Self>> {
        Ok(Self::cell(Glob::parse(glob)?))
    }

    #[turbo_tasks::function]
    pub async fn alternatives(globs: Vec<Vc<Glob>>) -> Result<Vc<Self>> {
        if globs.is_empty() {
            return Ok(Self::cell(Glob {
                raw: Vec::new(),
                implementation: GlobImpl::Set(GlobSet::empty()),
            }));
        }
        if globs.len() == 1 {
            return Ok(globs.into_iter().next().unwrap());
        }
        let mut set = GlobSet::builder();
        let mut raw = Vec::new();
        for glob in globs {
            let glob = &*glob.await?;
            for item in &glob.raw {
                raw.push(item.clone());
            }
        }
        for raw in &raw {
            set.add(parse_as_globset_glob(raw)?);
        }
        Ok(Self::cell(Glob {
            raw,
            implementation: GlobImpl::Set(set.build()?),
        }))
    }
}

#[cfg(test)]
mod tests {
    use rstest::*;

    use super::Glob;

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
    #[case::alternatives_chars("[abc]", "b")]
    fn glob_match(#[case] glob: &str, #[case] path: &str) {
        let glob = Glob::parse(glob.into()).unwrap();

        println!("{glob:?} {path}");

        assert!(glob.execute(path));
    }

    #[rstest]
    #[case::early_end("*.raw", "hello.raw.js")]
    #[case::early_end(
        "**/next/dist/esm/*.shared-runtime.js",
        "next/dist/shared/lib/app-router-context.shared-runtime.js"
    )]
    fn glob_not_matching(#[case] glob: &str, #[case] path: &str) {
        let glob = Glob::parse(glob.into()).unwrap();

        println!("{glob:?} {path}");

        assert!(!glob.execute(path));
    }
}
