/// The parsing and construction algorithms here are based on the the `globset` crate.
/// After discussing upstreaming our usecase with the authors of `globset`, we decided that a
/// fork was appropriate given our divergent usecases. See discussion https://github.com/BurntSushi/ripgrep/issues/3049
/// The original code had the following license:
///
/// > The MIT License (MIT)
/// >
/// > Copyright (c) 2015 Andrew Gallant
/// >
/// > Permission is hereby granted, free of charge, to any person obtaining a copy
/// > of this software and associated documentation files (the "Software"), to deal
/// > in the Software without restriction, including without limitation the rights
/// > to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
/// > copies of the Software, and to permit persons to whom the Software is
/// > furnished to do so, subject to the following conditions:
///
/// Here it has been heavily modified to:
/// - Eliminate various configuration options we don't need
/// - Eliminate the more complex `GlobSet` matcher strategies. We don't anticipate needing to
///   compose thousands of globs like ripgrep does and so don't need the performance
///   optimizations that come with that.
/// - Add the can_match_directory regex (this is what was rejected by upstream), this allows us
///   to check if a directory is a valid prefix of a path that would match the glob.
/// - Add support for nested alternations, a minor detail (this was also sent upstream in https://github.com/BurntSushi/ripgrep/pull/3048)
/// - Add a number of comments to clarify the code.
///
/// Still some of the cleverest ideas in the original code were in the parsing and construction
/// of regexes and those are mostly preserved.
use anyhow::Error;

use crate::glob::GlobOptions;

/// The parsed tokens of a glob pattern.
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
    /// Any Single non path separator character
    Any,
    /// Any number of non path separator characters
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
        // This is just precomputed since it is used in two places.
        matches_slash: bool,
    },
    Alternates(Vec<Tokens>),
}

impl Tokens {
    /// Convert this pattern to a string that is guaranteed to be a valid
    /// regular expression and will represent the matching semantics of this
    /// glob pattern and the options given.
    fn to_regex(&self, opts: GlobOptions) -> String {
        self.to_regex_impl(Self::tokens_to_regex, opts)
    }

    /// Convert this pattern to a string that is guaranteed to be a valid
    /// regular expression and will represent the matching semantics of this
    /// glob pattern when used to check if a directory path might contain files that match this
    /// glob.
    /// This means we care about matching prefixes that are bounded by `/` characters.
    /// The basic strategy is to add 'early exits' to the regex at `/` boundaries.
    /// e.g. `foo/bar/baz` -> `foo(?:/bar(?:/baz(?:/.*)?)?)?`
    /// that way 'foo' will match but foo/baz will not
    fn to_directory_match_regex(&self, opts: GlobOptions) -> String {
        self.to_regex_impl(Self::tokens_to_directory_match_regex, opts)
    }

    fn to_regex_impl(
        &self,
        tokens_to_regex_fn: fn(&[Token], &mut String),
        opts: GlobOptions,
    ) -> String {
        let mut re = String::new();
        // We don't care care about for unicode correctness.  Paths do not require this and if the
        // caller does they can simply take care to pass us valid utf8 themselves.
        re.push_str("(?-u)");

        // Enable anchored matches unless
        if !opts.contains {
            re.push('^');
        }
        // Special case. If the entire glob is just `**`, then it should match
        // everything.
        if self.len() == 1 && self[0] == Token::RecursivePrefix {
            re.push_str(".*");
        } else {
            tokens_to_regex_fn(self, &mut re);
        }
        if !opts.contains {
            re.push('$');
        }
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
                    matches_slash: _,
                } => {
                    build_char_class(re, negated, ranges);
                }
                Token::Alternates(ref patterns) => {
                    build_alternates(re, patterns, Self::tokens_to_regex);
                }
            }
        }
    }

    fn tokens_to_directory_match_regex(tokens: &[Token], re: &mut String) {
        Self::tokens_to_directory_match_regex_inner(tokens, re, true)
    }
    fn tokens_to_directory_match_regex_inner(mut tokens: &[Token], re: &mut String, at_end: bool) {
        // If this branch is in a suffix position, then we need to try to trim any trailing filename
        // patterns. We do this by scanning
        if at_end {
            // first trim any trailing literal filename matches
            // e.g. foo/file.js -> foo/
            // globs match filenames so any trailing literal should not match a directory name.
            while let Some(tok) = tokens.last() {
                match tok {
                    Token::Literal(c) => {
                        tokens = &tokens[..tokens.len() - 1];
                        if *c == '/' {
                            // This is a directory separator, so we can stop trimming after this
                            break;
                        }
                    }
                    Token::Class {
                        negated: _,
                        ranges: _,
                        matches_slash,
                    } => {
                        if !*matches_slash {
                            // This is a non-slash literal or class that doesn't match a slash
                            // so we can trim it.
                            tokens = &tokens[..tokens.len() - 1];
                        } else {
                            break;
                        }
                    }
                    Token::ZeroOrMore | Token::Any => {
                        tokens = &tokens[..tokens.len() - 1];
                    }
                    Token::Alternates(_)
                    | Token::RecursiveZeroOrMore
                    | Token::RecursiveSuffix
                    | Token::RecursivePrefix => {
                        break;
                    }
                }
            }
        }

        let mut open_optional_suffixes: usize = 0;
        for (index, tok) in tokens.iter().enumerate() {
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
                Token::RecursivePrefix => {
                    re.push_str(".*");
                    // A match like this will match all directories, so we don't need to examine the
                    // rest of the tokens.
                    break;
                }
                Token::RecursiveZeroOrMore | Token::RecursiveSuffix => {
                    re.push_str("(?:/.*)?");
                    break;
                }

                Token::Class {
                    negated,
                    ref ranges,
                    matches_slash,
                } => {
                    // If the class matches then a valid directory match is the prefix starting here
                    // so make the rest optional.
                    if matches_slash {
                        re.push_str("(?:");
                        open_optional_suffixes += 1;
                    }
                    build_char_class(re, negated, ranges);
                }
                Token::Alternates(ref patterns) => {
                    build_alternates(
                        re,
                        patterns,
                        if index + 1 == tokens.len() {
                            Self::tokens_to_directory_match_regex
                        } else {
                            fn tokens_to_directory_match_regex_middle(
                                tokens: &[Token],
                                re: &mut String,
                            ) {
                                Tokens::tokens_to_directory_match_regex_inner(tokens, re, false)
                            }
                            tokens_to_directory_match_regex_middle
                        },
                    );
                }
            }
        }
        // close all the optional suffixes
        for _ in 0..open_optional_suffixes {
            re.push_str(")?")
        }
    }
}

fn build_alternates(re: &mut String, patterns: &Vec<Tokens>, branch_fn: fn(&[Token], &mut String)) {
    let mut parts = Vec::with_capacity(patterns.len());
    let mut has_empty_part = false;
    for pat in patterns {
        let mut altre = String::new();
        branch_fn(pat, &mut altre);
        if altre.is_empty() {
            has_empty_part = true;
        } else {
            parts.push(altre);
        }
    }

    // It is possible to have an empty set in which case the
    // resulting alternation '()' would be an error.
    if !parts.is_empty() {
        re.push_str("(?:");
        if has_empty_part {
            re.push('|');
        }
        re.push_str(&parts.join("|"));
        re.push(')');
    }
}

fn build_char_class(re: &mut String, negated: bool, ranges: &Vec<(char, char)>) {
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

// Parse the glob and return a tuple of the regex and the directory match regex
// The regex is guaranteed to be valid and will match the same semantics as the glob.
// The directory match regex is guaranteed to be valid and will match the same
// semantics as the glob when used to check if a directory path might contain files that match
// this glob. This means we care about matching prefixes that are bounded by `/` characters.
pub(crate) fn parse(glob: &str, opts: GlobOptions) -> Result<(String, String), Error> {
    let tokens = Parser::new(glob).parse()?;
    Ok((tokens.to_regex(opts), tokens.to_directory_match_regex(opts)))
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
        // A trivial isolated '*'
        if self.peek() != Some('*') {
            self.push_token(Token::ZeroOrMore);
            return;
        }
        let prev = self.prev;
        // consume the next '*'
        assert!(self.bump() == Some('*'));
        // Are we at the very beginning of a branch?
        if !self.have_tokens() {
            // Are we at the end of the glob or a separator?
            if !self.peek().is_none_or(is_separator) {
                // Just push two zero or mores.
                // This is for something like '**foo/...`
                // See https://git-scm.com/docs/gitignore#_pattern_format for where this comes from
                self.push_token(Token::ZeroOrMore);
            } else {
                // this is just `**/....`
                self.push_token(Token::RecursivePrefix);
                assert!(self.bump().is_none_or(is_separator));
            }
            return;
        }

        // Are we at the beginning or not following a `/`?
        if !prev.map(is_separator).unwrap_or(false) {
            // same as the above, this is just an odd `a**/` pattern
            self.push_token(Token::ZeroOrMore);
            return;
        }
        debug_assert!(prev == Some('/'));
        let is_suffix = match self.peek() {
            None => {
                assert!(self.bump().is_none());
                true
            }
            Some(',') | Some('}') if !self.alternates_stack.is_empty() => true,
            Some(c) if is_separator(c) => {
                assert!(self.bump().map(is_separator).unwrap_or(false));
                false
            }
            _ => {
                self.push_token(Token::ZeroOrMore);
                return;
            }
        };
        // we don't need to check because we already checked 'have_tokens' above.
        match self.pop_token_unchecked() {
            // This is for `/**/**` which is kind of silly, just skip the second occurrence
            Token::RecursivePrefix => {
                self.push_token(Token::RecursivePrefix);
            }
            Token::RecursiveSuffix => {
                self.push_token(Token::RecursiveSuffix);
            }
            t => {
                // merge with the prior '/' token
                debug_assert!(Token::Literal('/') == t, "unexpected token {t:?}");
                if is_suffix {
                    // This is a `/**` at the end of a pattern.
                    self.push_token(Token::RecursiveSuffix);
                } else {
                    // This is a `/**/` in the middle of a pattern.
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
        // handle this as an alternation if it matches a `/`
        let matches_slash = if negated {
            // If all of the ranges exclude `/`, then the negation includes it.
            !ranges.iter().all(|r| r.0 > '/' || r.1 < '/')
        } else {
            // If any of the ranges include `/`, then the class includes it.
            ranges.iter().any(|r| r.0 <= '/' && r.1 >= '/')
        };

        self.push_token(Token::Class {
            negated,
            ranges,
            matches_slash,
        });
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

    use super::parse;
    use crate::glob::GlobOptions;

    #[rstest]
    #[case::literal("dir/file.js", "dir/file\\.js", "dir")]
    #[case::literal("a/b/c/file.js", "a/b/c/file\\.js", "a(?:/b(?:/c)?)?")]
    #[case::globstar("**/file.js", "(?:/?|.*/)file\\.js", ".*")]
    #[case::globstar("/**/file.js", "(?:/|/.*/)file\\.js", "(?:/.*)?")] // this one is a little silly since it does match the empty string
    #[case::globstar("a/**/file.js", "a(?:/|/.*/)file\\.js", "a(?:/.*)?")]
    #[case::globstar("a/**", "a/.*", "a(?:/.*)?")]
    #[case::alternates("{a,b,c}/d/**", "(?:a|b|c)/d/.*", "(?:a|b|c)(?:/d(?:/.*)?)?")]
    #[case::nested_alternates(
        "{a,b,c/{e,f,g}}/h/**",
        "(?:a|b|c/(?:e|f|g))/h/.*",
        "(?:a|b|c(?:/)?)(?:/h(?:/.*)?)?"
    )]
    #[case::classes("[abc]/d/**", "[abc]/d/.*", "[abc](?:/d(?:/.*)?)?")]
    fn glob_regex_mapping(
        #[case] glob: &str,
        #[case] glob_regex: &str,
        #[case] directory_match_regex: &str,
    ) {
        let (glob_re, directory_match_re) = parse(glob, GlobOptions::default()).unwrap();
        // All our regexes come with a fixed prefix and suffix, just assert and drop them
        fn strip_overhead(s: String) -> String {
            assert!(s.starts_with("(?-u)^"));
            assert!(s.ends_with("$"));
            s["(?-u)^".len()..s.len() - 1].to_string()
        }

        assert_eq!(glob_regex, strip_overhead(glob_re));
        assert_eq!(directory_match_regex, strip_overhead(directory_match_re));
    }
}
