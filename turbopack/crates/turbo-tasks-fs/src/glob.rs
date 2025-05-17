use anyhow::{Error, Result};
use regex::bytes::{Regex, RegexBuilder};
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

// Note: a/**/b does match a/b, so we need some special logic about path
// separators

#[turbo_tasks::value(eq = "manual")]
#[derive(Debug, Clone)]
#[serde(into = "GlobForm", try_from = "GlobForm")]
pub struct Glob {
    glob: String,
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

#[derive(Serialize, Deserialize)]
#[serde(transparent)]
#[repr(transparent)]
struct GlobForm {
    glob: String,
}
impl From<Glob> for GlobForm {
    fn from(value: Glob) -> Self {
        Self { glob: value.glob }
    }
}
impl TryFrom<GlobForm> for Glob {
    type Error = anyhow::Error;
    fn try_from(value: GlobForm) -> Result<Self, Self::Error> {
        Glob::parse(&value.glob)
    }
}

impl Glob {
    pub fn execute(&self, path: &str) -> bool {
        self.regex.is_match(path.as_bytes())
    }

    // Returns true if the glob matches the given path.
    pub fn matches(&self, path: &str) -> bool {
        self.regex.is_match(path.as_bytes())
    }

    // Returns true if the glob couldn't possibly match a filename underneath this `path` where the
    // path represents a directory.
    pub fn can_skip_directory(&self, path: &str) -> bool {
        debug_assert!(
            !path.ends_with('/'),
            "Path should be a directory name and not end with /"
        );
        !self.directory_match_regex.is_match(path.as_bytes())
    }

    pub fn parse(input: &str) -> Result<Glob> {
        let tokens: Tokens = Parser::new(input).parse()?;
        let regex = new_regex(tokens.to_regex().as_str());
        let directory_match_regex = new_regex(tokens.to_directory_match_regex().as_str());

        Ok(Glob {
            glob: input.to_string(),
            regex,
            directory_match_regex,
        })
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
        Ok(Self::cell(Glob::parse(glob.as_str())?))
    }

    #[turbo_tasks::function]
    pub async fn alternatives(globs: Vec<Vc<Glob>>) -> Result<Vc<Self>> {
        match globs.len() {
            0 => Ok(Glob::new("".into())),
            1 => Ok(globs.into_iter().next().unwrap()),
            _ => {
                // Composing the Regexes with a RegexSet would be more efficient since we wouldn't
                // need to recompile them.
                let mut new_glob = String::new();
                new_glob.push('{');
                for (index, glob) in globs.iter().enumerate() {
                    if index > 0 {
                        new_glob.push(',');
                    }
                    new_glob.push_str(&glob.await?.glob);
                }
                new_glob.push('}');
                Ok(Glob::new(new_glob.into()))
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

/// The parsing and construction algorithms are based on the the `globset` crate.
/// After discussing upstreaming our usecase with the authors of `globset`, we decided that a fork
/// was appropriate given our divergent usecases. See discussion https://github.com/BurntSushi/ripgrep/issues/3049
/// The original code is dual licensed under the MIT license and the Unlicense.
/// Copyright (c) 2015 Andrew Gallant
///
/// Here it is heavily modified to:
/// - Eliminate various configuration options we don't need
/// - Eliminate the more complex GlobSet matcher strategies. We don't anticipate needing to compose
///   thousands of globs like ripgrep and so don't need the performance optimizations that come with
///   that.
/// - Add the can_skip_directory method (this is what was rejected by upstream), this allows us to
///   check if a directory is a valid prefix of a path that would match the glob.
/// - Add support for nested alternations, a minor detail (this was also sent upstream in https://github.com/BurntSushi/ripgrep/pull/3048)
/// - And generally simplify representations.
///
/// Still some of the cleverest ideas in the original code were in the parsing and construction and
/// those are mostly preserved.

#[derive(Clone, Debug, Default, Eq, PartialEq)]
#[repr(transparent)]
struct Tokens(Vec<Token>);
impl std::ops::Deref for Tokens {
    type Target = Vec<Token>;
    fn deref(&self) -> &Vec<Token> {
        &self.0
    }
}

impl std::ops::DerefMut for Tokens {
    fn deref_mut(&mut self) -> &mut Vec<Token> {
        &mut self.0
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
enum Token {
    Literal(char),
    /// Any Single non path separator Character
    Any,
    /// Any
    ZeroOrMore,
    /// A `**` at the beginning of the pattern
    RecursivePrefix,
    // A `/**` at the end of the pattern
    RecursiveSuffix,
    // A `**` in the middle of a pattern
    RecursiveZeroOrMore,
    Class {
        negated: bool,
        ranges: Vec<(char, char)>,
    },
    Alternates(Vec<Tokens>),
}

impl Tokens {
    /// Convert this pattern to a string that is guaranteed to be a valid
    /// regular expression and will represent the matching semantics of this
    /// glob pattern and the options given.
    fn to_regex(&self) -> String {
        let mut re = String::new();
        re.push_str("(?-u)^");
        // Special case. If the entire glob is just `**`, then it should match
        // everything.
        if self.len() == 1 && self[0] == Token::RecursivePrefix {
            re.push_str(".*$");
            return re;
        }
        Tokens::tokens_to_regex(self, &mut re);
        re.push('$');
        re
    }

    fn tokens_to_regex(tokens: &[Token], re: &mut String) {
        for tok in tokens.iter() {
            match *tok {
                Token::Literal(c) => {
                    re.push_str(&char_to_escaped_literal(c));
                }
                Token::Any => {
                    re.push_str("[^/]");
                }
                Token::ZeroOrMore => {
                    re.push_str("[^/]*");
                }
                Token::RecursivePrefix => {
                    re.push_str("(?:/?|.*/)");
                }
                Token::RecursiveSuffix => {
                    re.push_str("/.*");
                }
                Token::RecursiveZeroOrMore => {
                    re.push_str("(?:/|/.*/)");
                }
                Token::Class {
                    negated,
                    ref ranges,
                } => {
                    re.push('[');
                    if negated {
                        re.push('^');
                    }
                    for r in ranges {
                        if r.0 == r.1 {
                            // Not strictly necessary, but nicer to look at.
                            re.push_str(&char_to_escaped_literal(r.0));
                        } else {
                            re.push_str(&char_to_escaped_literal(r.0));
                            re.push('-');
                            re.push_str(&char_to_escaped_literal(r.1));
                        }
                    }
                    re.push(']');
                }
                Token::Alternates(ref patterns) => {
                    let mut parts = vec![];
                    for pat in patterns {
                        let mut altre = String::new();
                        Tokens::tokens_to_regex(pat, &mut altre);
                        if !altre.is_empty() {
                            parts.push(altre);
                        }
                    }

                    // It is possible to have an empty set in which case the
                    // resulting alternation '()' would be an error.
                    if !parts.is_empty() {
                        re.push_str("(?:");
                        re.push_str(&parts.join("|"));
                        re.push(')');
                    }
                }
            }
        }
    }

    /// Convert this pattern to a string that is guaranteed to be a valid
    /// regular expression and will represent the matching semantics of this
    /// glob pattern when used to check if a directory path might contain files that match this
    /// glob.
    /// This means we care about matching prefixes that are bounded by `/` characters.
    /// The basic strategy is to add 'early exits' to the regex at `/` boundaries.
    /// e.g. `foo/bar/baz` -> `foo(?:/bar(?:/baz(?:/.*)?)?)?`
    /// that way 'foo' will match but foo/baz will not
    fn to_directory_match_regex(&self) -> String {
        let mut re = String::new();
        re.push_str("(?-u)");
        re.push('^');
        // Special case. If the entire glob is just `**`, then it should match
        // everything.
        if self.len() == 1 && self[0] == Token::RecursivePrefix {
            re.push_str(".*");
            re.push('$');
            return re;
        }
        Tokens::tokens_to_directory_match_regex(self, &mut re);
        re.push('$');
        re
    }

    fn tokens_to_directory_match_regex(tokens: &[Token], re: &mut String) {
        let mut open_optional_suffixes: usize = 0;
        for tok in tokens.iter() {
            match *tok {
                Token::Literal(c) => {
                    if c == '/' {
                        re.push_str("(?:");
                        open_optional_suffixes += 1;
                    }
                    re.push_str(&char_to_escaped_literal(c));
                }
                Token::Any => {
                    re.push_str("[^/]");
                }
                Token::ZeroOrMore => {
                    re.push_str("[^/]*");
                }
                Token::RecursiveZeroOrMore | Token::RecursivePrefix => {
                    re.push_str(".*");
                    // A match like this will match all directories, so we don't need to examine the
                    // rest of the tokens.
                    break;
                }
                Token::RecursiveSuffix => {
                    re.push_str("(?:/.*)?");
                    break;
                }

                Token::Class {
                    negated,
                    ref ranges,
                } => {
                    // handle this as an alternation if it matches a `/`
                    let matches_slash = if negated {
                        // If all of the ranges exclude `/`, then the negation includes it.
                        !ranges.iter().all(|r| r.0 > '/' || r.1 < '/')
                    } else {
                        // If any of the ranges include `/`, then the class includes it.
                        ranges.iter().any(|r| r.0 <= '/' && r.1 >= '/')
                    };
                    // If the class matches then a valid directory match is the prefix starting here
                    // so make the rest optional.
                    if matches_slash {
                        re.push_str("(?:");
                        open_optional_suffixes += 1;
                    }
                    re.push('[');
                    if negated {
                        re.push('^');
                    }
                    for r in ranges {
                        if r.0 == r.1 {
                            // Not strictly necessary, but nicer to look at.
                            re.push_str(&char_to_escaped_literal(r.0));
                        } else {
                            re.push_str(&char_to_escaped_literal(r.0));
                            re.push('-');
                            re.push_str(&char_to_escaped_literal(r.1));
                        }
                    }
                    re.push(']');
                }
                Token::Alternates(ref patterns) => {
                    let mut parts = Vec::with_capacity(patterns.len());
                    for pat in patterns {
                        let mut altre = String::new();
                        Tokens::tokens_to_directory_match_regex(pat, &mut altre);
                        if !altre.is_empty() {
                            parts.push(altre);
                        }
                    }

                    // It is possible to have an empty set in which case the
                    // resulting alternation '()' would be an error.
                    if !parts.is_empty() {
                        re.push_str("(?:");
                        re.push_str(&parts.join("|"));
                        re.push(')');
                    }
                }
            }
        }
        // close all the optional suffixes
        for _ in 0..open_optional_suffixes {
            re.push_str(")?")
        }
    }
}

/// Convert a Unicode scalar value to an escaped string suitable for use as
/// a literal in a non-Unicode regex.
fn char_to_escaped_literal(c: char) -> String {
    let mut buf = [0; 4];
    return regex::escape(c.encode_utf8(&mut buf));
}

/// The kind of error that can occur when parsing a glob pattern.
#[derive(Clone, Debug, Eq, PartialEq)]
enum ErrorKind {
    /// Occurs when a character class (e.g., `[abc]`) is not closed.
    UnclosedClass,
    /// Occurs when a range in a character (e.g., `[a-z]`) is invalid. For
    /// example, if the range starts with a lexicographically larger character
    /// than it ends with.
    InvalidRange(char, char),
    /// Occurs when a `}` is found without a matching `{`.
    UnopenedAlternates,
    /// Occurs when a `{` is found without a matching `}`.
    UnclosedAlternates,
    /// Occurs when an unescaped '\' is found at the end of a glob.
    DanglingEscape,
}

impl ErrorKind {
    fn description(&self, pos: usize) -> String {
        let str: &'static str = match *self {
            ErrorKind::UnclosedClass => "unclosed character class; missing ']'",
            ErrorKind::InvalidRange(_, _) => "invalid character range",
            ErrorKind::UnopenedAlternates => {
                "unopened alternate group; missing '{' (maybe escape '}' with '[}]'?)"
            }
            ErrorKind::UnclosedAlternates => {
                "unclosed alternate group; missing '}' (maybe escape '{' with '[{]'?)"
            }
            ErrorKind::DanglingEscape => "dangling '\\'",
        };
        format!("{str} @{pos}")
    }
}

struct Parser<'a> {
    glob: &'a str,
    // Stores the offsets of where each set of nested alternates started.
    alternates_stack: Vec<usize>,
    // The current set of alternate branches being parsed.
    // Guaranteed to be non-empty.
    branches: Vec<Tokens>,
    chars: std::iter::Peekable<std::str::Chars<'a>>,
    // position in terms of characters, not bytes.
    char_pos: usize,
    prev: Option<char>,
    cur: Option<char>,
}
fn is_separator(c: char) -> bool {
    c == '/'
}
impl<'a> Parser<'a> {
    fn new(glob: &'a str) -> Self {
        Parser {
            glob,
            alternates_stack: vec![],
            branches: vec![Tokens::default()],
            chars: glob.chars().peekable(),
            char_pos: 0,
            prev: None,
            cur: None,
        }
    }
    fn error(&self, kind: ErrorKind) -> Error {
        Error::msg(kind.description(self.char_pos))
            .context(format!("Parsing glob pattern: {}", self.glob))
    }

    // Parsing consumes the parser
    fn parse(mut self) -> Result<Tokens, Error> {
        while let Some(c) = self.bump() {
            match c {
                '?' => self.push_token(Token::Any),
                '*' => self.parse_star(),
                '[' => self.parse_class()?,
                '{' => self.push_alternate(),
                '}' => self.pop_alternate()?,
                ',' => self.parse_comma(),
                '\\' => self.parse_backslash()?,
                c => self.push_token(Token::Literal(c)),
            }
        }
        if !self.alternates_stack.is_empty() {
            return Err(self.error(ErrorKind::UnclosedAlternates));
        }
        debug_assert!(self.branches.len() == 1);
        return Ok(self.branches.pop().unwrap());
    }

    fn push_alternate(&mut self) {
        self.alternates_stack.push(self.branches.len());
        self.branches.push(Tokens::default());
    }

    fn pop_alternate(&mut self) -> Result<(), Error> {
        let Some(start) = self.alternates_stack.pop() else {
            return Err(self.error(ErrorKind::UnopenedAlternates));
        };
        let alts = self.branches.split_off(start);
        self.push_token(Token::Alternates(alts));
        Ok(())
    }

    fn push_token(&mut self, tok: Token) {
        self.branches.last_mut().unwrap().push(tok);
    }

    // Panics if there are no tokens to pop.
    fn pop_token_unchecked(&mut self) -> Token {
        self.branches.last_mut().unwrap().pop().unwrap()
    }

    fn have_tokens(&self) -> bool {
        !self.branches.last().unwrap().is_empty()
    }

    fn parse_comma(&mut self) {
        // If we aren't inside a group alternation, then don't
        // treat commas specially. Otherwise, we need to start
        // a new alternate.
        if self.alternates_stack.is_empty() {
            self.push_token(Token::Literal(','))
        } else {
            self.branches.push(Tokens::default())
        }
    }

    fn parse_backslash(&mut self) -> Result<(), Error> {
        match self.bump() {
            None => Err(self.error(ErrorKind::DanglingEscape)),
            Some(c) => {
                self.push_token(Token::Literal(c));
                Ok(())
            }
        }
    }

    fn parse_star(&mut self) {
        let prev = self.prev;
        if self.peek() != Some('*') {
            self.push_token(Token::ZeroOrMore);
            return;
        }
        assert!(self.bump() == Some('*'));
        if !self.have_tokens() {
            if !self.peek().is_none_or(is_separator) {
                self.push_token(Token::ZeroOrMore);
                self.push_token(Token::ZeroOrMore);
            } else {
                self.push_token(Token::RecursivePrefix);
                assert!(self.bump().is_none_or(is_separator));
            }
            return;
        }

        if !prev.map(is_separator).unwrap_or(false)
            && (self.branches.len() <= 1 || (prev != Some(',') && prev != Some('{')))
        {
            self.push_token(Token::ZeroOrMore);
            self.push_token(Token::ZeroOrMore);
            return;
        }
        let is_suffix = match self.peek() {
            None => {
                assert!(self.bump().is_none());
                true
            }
            Some(',') | Some('}') if self.branches.len() >= 2 => true,
            Some(c) if is_separator(c) => {
                assert!(self.bump().map(is_separator).unwrap_or(false));
                false
            }
            _ => {
                self.push_token(Token::ZeroOrMore);
                self.push_token(Token::ZeroOrMore);
                return;
            }
        };
        match self.pop_token_unchecked() {
            Token::RecursivePrefix => {
                self.push_token(Token::RecursivePrefix);
            }
            Token::RecursiveSuffix => {
                self.push_token(Token::RecursiveSuffix);
            }
            _ => {
                if is_suffix {
                    self.push_token(Token::RecursiveSuffix);
                } else {
                    self.push_token(Token::RecursiveZeroOrMore);
                }
            }
        }
    }

    fn parse_class(&mut self) -> Result<(), Error> {
        fn add_to_last_range(r: &mut (char, char), add: char) -> Option<ErrorKind> {
            r.1 = add;
            if r.1 < r.0 {
                Some(ErrorKind::InvalidRange(r.0, r.1))
            } else {
                None
            }
        }
        let mut ranges = vec![];
        let negated = match self.chars.peek() {
            Some(&'!') | Some(&'^') => {
                let bump = self.bump();
                assert!(bump == Some('!') || bump == Some('^'));
                true
            }
            _ => false,
        };
        let mut first = true;
        let mut in_range = false;
        loop {
            let c = match self.bump() {
                Some(c) => c,
                // The only way to successfully break this loop is to observe
                // a ']'.
                None => return Err(self.error(ErrorKind::UnclosedClass)),
            };
            match c {
                ']' => {
                    if first {
                        ranges.push((']', ']'));
                    } else {
                        break;
                    }
                }
                '-' => {
                    if first {
                        ranges.push(('-', '-'));
                    } else if in_range {
                        // invariant: in_range is only set when there is
                        // already at least one character seen.
                        let r = ranges.last_mut().unwrap();
                        if let Some(kind) = add_to_last_range(r, '-') {
                            return Err(self.error(kind));
                        }
                        in_range = false;
                    } else {
                        assert!(!ranges.is_empty());
                        in_range = true;
                    }
                }
                c => {
                    if in_range {
                        // invariant: in_range is only set when there is
                        // already at least one character seen.
                        if let Some(kind) = add_to_last_range(ranges.last_mut().unwrap(), '-') {
                            return Err(self.error(kind));
                        }
                    } else {
                        ranges.push((c, c));
                    }
                    in_range = false;
                }
            }
            first = false;
        }
        if in_range {
            // Means that the last character in the class was a '-', so add
            // it as a literal.
            ranges.push(('-', '-'));
        }
        self.push_token(Token::Class { negated, ranges });
        Ok(())
    }

    fn bump(&mut self) -> Option<char> {
        self.prev = self.cur;
        self.cur = self.chars.next();
        if self.cur.is_some() {
            self.char_pos += 1;
        }
        self.cur
    }

    fn peek(&mut self) -> Option<char> {
        self.chars.peek().copied()
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
        let glob = Glob::parse(glob).unwrap();

        println!("{glob:?} {path}");

        assert!(glob.matches(path));
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

    #[rstest]
    #[case::dir_and_file_partial("dir/file.js", "dir")]
    #[case::dir_star_partial("dir/*.js", "dir")]
    #[case::globstar_partial("**/**/*.js", "dir/sub")]
    #[case::globstar_partial("**/**/*.js", "dir")]
    #[case::globstar_in_dir_partial("dir/**/sub/file.js", "dir/a/b/sub")]
    #[case::globstar_in_dir_partial("dir/**/sub/file.js", "dir/a/b")]
    #[case::globstar_in_dir_partial("dir/**/sub/file.js", "dir/a")]
    #[case::globstar_in_dir_partial("dir/**/sub/file.js", "dir")]
    #[case::alternatives_chars("[abc]", "b")]
    fn glob_can_skip_directory(#[case] glob: &str, #[case] path: &str) {
        let glob = Glob::parse(glob).unwrap();

        println!("{glob:?} {path}");

        assert!(!glob.can_skip_directory(path));
    }
}
