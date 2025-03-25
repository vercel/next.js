use std::mem::take;

use anyhow::{anyhow, bail, Context, Result};
use serde::{Deserialize, Serialize};
use turbo_rcstr::RcStr;
use turbo_tasks::{trace::TraceRawVcs, NonLocalValue, TryJoinIterExt, Vc};
use unicode_segmentation::GraphemeCursor;

#[derive(PartialEq, Eq, Debug, Clone, TraceRawVcs, Serialize, Deserialize, NonLocalValue)]
enum GlobPart {
    /// `/**/`: Matches any path of directories
    AnyDirectories,

    /// `*`: Matches any filename (no path separator)
    AnyFile,

    /// `?`: Matches a single filename character (no path separator)
    AnyFileChar,

    /// `/`: Matches the path separator
    PathSeparator,

    /// `[abc]`: Matches any char of the list
    FileChar(Vec<char>),

    /// `abc`: Matches literal filename
    File(String),

    /// `{a,b,c}`: Matches any of the globs in the list
    Alternatives(Vec<Glob>),
}

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

#[turbo_tasks::value]
#[derive(Debug, Clone)]
pub struct Glob {
    expression: Vec<GlobPart>,
}

impl Glob {
    pub fn execute(&self, path: &str) -> bool {
        let match_partial = path.ends_with('/');
        self.iter_matches(path, true, match_partial)
            .any(|result| matches!(result, ("", _)))
    }

    fn iter_matches<'a>(
        &'a self,
        path: &'a str,
        previous_part_is_path_separator_equivalent: bool,
        match_partial: bool,
    ) -> GlobMatchesIterator<'a> {
        GlobMatchesIterator {
            current: path,
            glob: self,
            match_partial,
            is_path_separator_equivalent: previous_part_is_path_separator_equivalent,
            stack: Vec::new(),
            index: 0,
        }
    }

    pub fn parse(input: &str) -> Result<Glob> {
        let mut current = input;
        let mut expression = Vec::new();

        while !current.is_empty() {
            let (part, remainder) = GlobPart::parse(current, false)
                .with_context(|| anyhow!("Failed to parse glob {input}"))?;
            expression.push(part);
            current = remainder;
        }

        Ok(Glob { expression })
    }
}

struct GlobMatchesIterator<'a> {
    current: &'a str,
    glob: &'a Glob,
    match_partial: bool,
    is_path_separator_equivalent: bool,
    stack: Vec<GlobPartMatchesIterator<'a>>,
    index: usize,
}

impl<'a> Iterator for GlobMatchesIterator<'a> {
    type Item = (&'a str, bool);

    fn next(&mut self) -> Option<Self::Item> {
        loop {
            if let Some(part) = self.glob.expression.get(self.index) {
                let iter = if let Some(iter) = self.stack.get_mut(self.index) {
                    iter
                } else {
                    let iter = part.iter_matches(
                        self.current,
                        self.is_path_separator_equivalent,
                        self.match_partial,
                    );
                    self.stack.push(iter);
                    self.stack.last_mut().unwrap()
                };
                if let Some((new_path, new_is_path_separator_equivalent)) = iter.next() {
                    self.current = new_path;
                    self.is_path_separator_equivalent = new_is_path_separator_equivalent;

                    self.index += 1;

                    if self.match_partial && self.current.is_empty() {
                        return Some(("", self.is_path_separator_equivalent));
                    }
                } else {
                    if self.index == 0 {
                        // failed to match
                        return None;
                    }
                    // backtrack
                    self.stack.pop();
                    self.index -= 1;
                }
            } else {
                // end of expression, matched successfully

                // backtrack for the next iteration
                self.index -= 1;

                return Some((self.current, self.is_path_separator_equivalent));
            }
        }
    }
}

impl GlobPart {
    /// Iterates over all possible matches of this part with the provided path.
    /// The least greedy match is returned first. This is usually used for
    /// backtracking. The string slice returned is the remaining part or the
    /// path. The boolean flag returned specifies if the matched part should
    /// be considered as path-separator equivalent.
    fn iter_matches<'a>(
        &'a self,
        path: &'a str,
        previous_part_is_path_separator_equivalent: bool,
        match_partial: bool,
    ) -> GlobPartMatchesIterator<'a> {
        GlobPartMatchesIterator {
            path,
            part: self,
            match_partial,
            previous_part_is_path_separator_equivalent,
            cursor: GraphemeCursor::new(0, path.len(), true),
            index: 0,
            glob_iterator: None,
        }
    }

    fn parse(input: &str, inside_of_braces: bool) -> Result<(GlobPart, &str)> {
        debug_assert!(!input.is_empty());
        let two_chars = {
            let mut chars = input.chars();
            (chars.next().unwrap(), chars.next())
        };
        match two_chars {
            ('/', _) => Ok((GlobPart::PathSeparator, &input[1..])),
            ('*', Some('*')) => Ok((GlobPart::AnyDirectories, &input[2..])),
            ('*', _) => Ok((GlobPart::AnyFile, &input[1..])),
            ('?', _) => Ok((GlobPart::AnyFileChar, &input[1..])),
            ('[', Some('[')) => todo!("glob char classes are not implemented yet"),
            ('[', _) => todo!("glob char sequences are not implemented yet"),
            ('{', Some(_)) => {
                let mut current = &input[1..];
                let mut alternatives = Vec::new();
                let mut expression = Vec::new();

                loop {
                    let (part, remainder) = GlobPart::parse(current, true)?;
                    expression.push(part);
                    current = remainder;
                    match current.chars().next() {
                        Some(',') => {
                            alternatives.push(Glob {
                                expression: take(&mut expression),
                            });
                            current = &current[1..];
                        }
                        Some('}') => {
                            alternatives.push(Glob {
                                expression: take(&mut expression),
                            });
                            current = &current[1..];
                            break;
                        }
                        None => bail!("Unterminated glob braces"),
                        _ => {
                            // next part of the glob
                        }
                    }
                }

                Ok((GlobPart::Alternatives(alternatives), current))
            }
            ('{', None) => {
                bail!("Unterminated glob braces")
            }
            _ => {
                let mut is_escaped = false;
                let mut literal = String::new();

                let mut cursor = GraphemeCursor::new(0, input.len(), true);

                let mut start = cursor.cur_cursor();
                let mut end_cursor = cursor
                    .next_boundary(input, 0)
                    .map_err(|e| anyhow!("{:?}", e))?;

                while let Some(end) = end_cursor {
                    let c = &input[start..end];
                    if is_escaped {
                        is_escaped = false;
                    } else if c == "\\" {
                        is_escaped = true;
                    } else if c == "/"
                        || c == "*"
                        || c == "?"
                        || c == "["
                        || c == "{"
                        || (inside_of_braces && (c == "," || c == "}"))
                    {
                        break;
                    }
                    literal.push_str(c);

                    start = cursor.cur_cursor();
                    end_cursor = cursor
                        .next_boundary(input, end)
                        .map_err(|e| anyhow!("{:?}", e))?;
                }

                Ok((GlobPart::File(literal), &input[start..]))
            }
        }
    }
}

struct GlobPartMatchesIterator<'a> {
    path: &'a str,
    part: &'a GlobPart,
    match_partial: bool,
    previous_part_is_path_separator_equivalent: bool,
    cursor: GraphemeCursor,
    index: usize,
    glob_iterator: Option<Box<GlobMatchesIterator<'a>>>,
}

impl<'a> Iterator for GlobPartMatchesIterator<'a> {
    type Item = (&'a str, bool);

    fn next(&mut self) -> Option<Self::Item> {
        match self.part {
            GlobPart::AnyDirectories => {
                if self.cursor.cur_cursor() == 0 {
                    let Ok(Some(_)) = self.cursor.next_boundary(self.path, 0) else {
                        return None;
                    };
                    return Some((self.path, true));
                }

                if self.cursor.cur_cursor() == self.path.len() {
                    return None;
                }

                loop {
                    let start = self.cursor.cur_cursor();
                    // next_boundary does not set cursor offset to the end of the string
                    // if there is no next boundary - manually set cursor to the end
                    let end = match self.cursor.next_boundary(self.path, 0) {
                        Ok(end) => {
                            if let Some(end) = end {
                                end
                            } else {
                                self.cursor.set_cursor(self.path.len());
                                self.cursor.cur_cursor()
                            }
                        }
                        _ => return None,
                    };

                    if &self.path[start..end] == "/" {
                        return Some((&self.path[end..], true));
                    } else if start == end {
                        return Some((&self.path[start..], false));
                    }
                }
            }
            GlobPart::AnyFile => {
                let Ok(Some(c)) = self.cursor.next_boundary(self.path, 0) else {
                    return None;
                };

                let idx = self.path[0..c].len();

                // TODO verify if `*` does match zero chars?
                if let Some(slice) = self.path.get(0..c) {
                    if slice.ends_with('/') {
                        None
                    } else {
                        Some((
                            &self.path[c..],
                            self.previous_part_is_path_separator_equivalent && idx == 1,
                        ))
                    }
                } else {
                    None
                }
            }
            GlobPart::AnyFileChar => todo!(),
            GlobPart::PathSeparator => {
                if self.cursor.cur_cursor() == 0 {
                    let Ok(Some(b)) = self.cursor.next_boundary(self.path, 0) else {
                        return None;
                    };
                    if self.path.starts_with('/') {
                        Some((&self.path[b..], true))
                    } else if self.previous_part_is_path_separator_equivalent {
                        Some((self.path, true))
                    } else {
                        None
                    }
                } else {
                    None
                }
            }
            GlobPart::FileChar(chars) => {
                let start = self.cursor.cur_cursor();
                let Ok(Some(end)) = self.cursor.next_boundary(self.path, 0) else {
                    return None;
                };
                let mut chars_in_path = self.path[start..end].chars();
                let c = chars_in_path.next()?;
                if chars_in_path.next().is_some() {
                    return None;
                }
                chars.contains(&c).then(|| (&self.path[end..], false))
            }
            GlobPart::File(name) => {
                if self.cursor.cur_cursor() == 0 && self.path.starts_with(name) {
                    let Ok(Some(_)) = self.cursor.next_boundary(self.path, 0) else {
                        return None;
                    };
                    Some((&self.path[name.len()..], false))
                } else {
                    None
                }
            }
            GlobPart::Alternatives(alternatives) => loop {
                if let Some(glob_iterator) = &mut self.glob_iterator {
                    if let Some((path, is_path_separator_equivalent)) = glob_iterator.next() {
                        return Some((path, is_path_separator_equivalent));
                    } else {
                        self.index += 1;
                        self.glob_iterator = None;
                    }
                } else if let Some(alternative) = alternatives.get(self.index) {
                    self.glob_iterator = Some(Box::new(alternative.iter_matches(
                        self.path,
                        self.previous_part_is_path_separator_equivalent,
                        self.match_partial,
                    )));
                } else {
                    return None;
                }
            },
        }
    }
}

impl TryFrom<&str> for Glob {
    type Error = anyhow::Error;

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        Glob::parse(value)
    }
}

#[turbo_tasks::value_impl]
impl Glob {
    #[turbo_tasks::function]
    pub fn new(glob: RcStr) -> Result<Vc<Self>> {
        Ok(Self::cell(Glob::try_from(glob.as_str())?))
    }

    #[turbo_tasks::function]
    pub async fn alternatives(globs: Vec<Vc<Glob>>) -> Result<Vc<Self>> {
        if globs.len() == 1 {
            return Ok(globs.into_iter().next().unwrap());
        }
        Ok(Self::cell(Glob {
            expression: vec![GlobPart::Alternatives(
                globs.into_iter().map(|g| g.owned()).try_join().await?,
            )],
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
    #[case::dir_and_file_partial("dir/file.js", "dir/")]
    #[case::file_braces("file.{ts,js}", "file.js")]
    #[case::dir_and_file_braces("dir/file.{ts,js}", "dir/file.js")]
    #[case::dir_and_file_dir_braces("{dir,other}/file.{ts,js}", "dir/file.js")]
    #[case::star("*.js", "file.js")]
    #[case::dir_star("dir/*.js", "dir/file.js")]
    #[case::dir_star_partial("dir/*.js", "dir/")]
    #[case::globstar("**/*.js", "file.js")]
    #[case::globstar("**/*.js", "dir/file.js")]
    #[case::globstar("**/*.js", "dir/sub/file.js")]
    #[case::globstar("**/**/*.js", "file.js")]
    #[case::globstar("**/**/*.js", "dir/sub/file.js")]
    #[case::globstar_partial("**/**/*.js", "dir/sub/")]
    #[case::globstar_partial("**/**/*.js", "dir/")]
    #[case::globstar_in_dir("dir/**/sub/file.js", "dir/sub/file.js")]
    #[case::globstar_in_dir("dir/**/sub/file.js", "dir/a/sub/file.js")]
    #[case::globstar_in_dir("dir/**/sub/file.js", "dir/a/b/sub/file.js")]
    #[case::globstar_in_dir(
        "**/next/dist/**/*.shared-runtime.js",
        "next/dist/shared/lib/app-router-context.shared-runtime.js"
    )]
    #[case::globstar_in_dir_partial("dir/**/sub/file.js", "dir/a/b/sub/")]
    #[case::globstar_in_dir_partial("dir/**/sub/file.js", "dir/a/b/")]
    #[case::globstar_in_dir_partial("dir/**/sub/file.js", "dir/a/")]
    #[case::globstar_in_dir_partial("dir/**/sub/file.js", "dir/")]
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
    // #[case::alternatives_chars("[abc]", "b")]
    fn glob_match(#[case] glob: &str, #[case] path: &str) {
        let glob = Glob::parse(glob).unwrap();

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
        let glob = Glob::parse(glob).unwrap();

        println!("{glob:?} {path}");

        assert!(!glob.execute(path));
    }
}
