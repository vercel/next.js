use anyhow::Result;
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
        let mut stack = Vec::new();
        let mut i = 0;
        let mut current = path;
        let mut is_path_separator_equalivalent = true;
        loop {
            if let Some(part) = self.expression.get(i) {
                let iter = if let Some(iter) = stack.get_mut(i) {
                    iter
                } else {
                    let iter = part.iter_matches(current, is_path_separator_equalivalent);
                    stack.push(iter);
                    stack.last_mut().unwrap()
                };
                if let Some((new_path, new_is_path_separator_equalivalent)) = iter.next() {
                    current = new_path;
                    is_path_separator_equalivalent = new_is_path_separator_equalivalent;

                    i += 1;

                    if match_partial && current.is_empty() {
                        return true;
                    }
                } else {
                    if i == 0 {
                        // failed to match
                        return false;
                    }
                    // backtrace
                    stack.pop();
                    i -= 1;
                }
            } else {
                // end of expression, matched successfully if also end of path
                if current.is_empty() {
                    return true;
                }
                // backtrace
                i -= 1;
            }
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

impl GlobPart {
    fn iter_matches<'a>(
        &'a self,
        path: &'a str,
        previous_part_is_path_separator_equalivalent: bool,
    ) -> impl Iterator<Item = (&'a str, bool)> {
        GlobPartMatchesIterator {
            path,
            part: self,
            previous_part_is_path_separator_equalivalent,
            index: 0,
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
            ('{', _) => todo!("glob braces are not implemented yet"),
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
    previous_part_is_path_separator_equalivalent: bool,
    index: usize,
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
                            self.previous_part_is_path_separator_equalivalent && self.index == 1,
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
                    } else if self.previous_part_is_path_separator_equalivalent {
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
            GlobPart::Alternatives(_) => todo!(),
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
