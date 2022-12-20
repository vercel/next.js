use std::mem::take;

use anyhow::{bail, Result};
use serde::{Deserialize, Serialize};
use turbo_tasks::trace::TraceRawVcs;

#[derive(PartialEq, Eq, Debug, Clone, TraceRawVcs, Serialize, Deserialize)]
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
// - {a/**,*}/file = Alternatives([File(a), PathSeparator, AnyDirectories],
//   [AnyFile]), PathSeparator, File(file)

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
            .next()
            .is_some()
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
            let (part, remainder) = GlobPart::parse(current, false)?;
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
                        _ => bail!("Unterminated glob braces"),
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
                let mut index = 0;
                for c in input.chars() {
                    if is_escaped {
                        is_escaped = false;
                    } else if c == '\\' {
                        is_escaped = true;
                    } else if c == '/'
                        || c == '*'
                        || c == '?'
                        || c == '['
                        || c == '{'
                        || (inside_of_braces && (c == ',' || c == '}'))
                    {
                        break;
                    }
                    literal.push(c);
                    index += 1;
                }
                Ok((GlobPart::File(literal), &input[index..]))
            }
        }
    }
}

struct GlobPartMatchesIterator<'a> {
    path: &'a str,
    part: &'a GlobPart,
    match_partial: bool,
    previous_part_is_path_separator_equivalent: bool,
    index: usize,
    glob_iterator: Option<Box<GlobMatchesIterator<'a>>>,
}

impl<'a> Iterator for GlobPartMatchesIterator<'a> {
    type Item = (&'a str, bool);

    fn next(&mut self) -> Option<Self::Item> {
        match self.part {
            GlobPart::AnyDirectories => {
                if self.index == 0 {
                    self.index += 1;
                    return Some((self.path, true));
                }
                let mut iter = self.path.chars();
                if iter.advance_by(self.index - 1).is_err() {
                    return None;
                }
                loop {
                    self.index += 1;
                    match iter.next() {
                        Some('/') => {
                            return Some((&self.path[self.index - 1..], true));
                        }
                        Some(_) => {}
                        None => {
                            return Some((&self.path[self.index - 2..], false));
                        }
                    }
                }
            }
            GlobPart::AnyFile => {
                self.index += 1;
                // TODO verify if `*` does match zero chars?
                if let Some(slice) = self.path.get(0..self.index) {
                    if slice.ends_with('/') {
                        None
                    } else {
                        Some((
                            &self.path[self.index..],
                            self.previous_part_is_path_separator_equivalent && self.index == 1,
                        ))
                    }
                } else {
                    None
                }
            }
            GlobPart::AnyFileChar => todo!(),
            GlobPart::PathSeparator => {
                if self.index == 0 {
                    self.index = 1;
                    if self.path.starts_with('/') {
                        Some((&self.path[1..], true))
                    } else if self.previous_part_is_path_separator_equivalent {
                        Some((self.path, true))
                    } else {
                        None
                    }
                } else {
                    None
                }
            }
            GlobPart::FileChar(chars) => loop {
                if let Some(c) = chars.get(self.index) {
                    self.index += 1;
                    if self.path.starts_with(*c) {
                        return Some((&self.path[1..], false));
                    }
                } else {
                    return None;
                }
            },
            GlobPart::File(name) => {
                if self.index == 0 && self.path.starts_with(name) {
                    self.index += 1;
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
impl GlobVc {
    #[turbo_tasks::function]
    pub fn new(glob: &str) -> Result<Self> {
        Ok(Self::cell(Glob::try_from(glob)?))
    }
}

#[cfg(test)]
mod tests {
    use rstest::*;

    use super::Glob;

    #[rstest]
    #[case::file("file.js", "file.js")]
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
    #[case::globstar_in_dir_partial("dir/**/sub/file.js", "dir/a/b/sub/")]
    #[case::globstar_in_dir_partial("dir/**/sub/file.js", "dir/a/b/")]
    #[case::globstar_in_dir_partial("dir/**/sub/file.js", "dir/a/")]
    #[case::globstar_in_dir_partial("dir/**/sub/file.js", "dir/")]
    #[case::star_dir(
        "**/*/next/dist/server/next.js",
        "node_modules/next/dist/server/next.js"
    )]
    fn glob_match(#[case] glob: &str, #[case] path: &str) {
        let glob = Glob::parse(glob).unwrap();

        println!("{glob:?} {path}");

        assert!(glob.execute(path));
    }
}
