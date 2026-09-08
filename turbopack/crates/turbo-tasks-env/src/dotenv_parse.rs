//! dotenv parsing that never touches the process-global environment.
//!
//! The parser itself is vendored from the `dotenvs` crate
//! (https://github.com/arniu/dotenvs-rs) — `dotenvs` resolves variable
//! references (`$VAR`) through `std::env`, which forced callers to mutate the
//! real process environment while parsing; here substitution resolves against
//! a caller-supplied map instead.
//!
//! The MIT License (MIT)
//!
//! Copyright (c) 2014 Santiago Lapresta and contributors
//! Copyright (c) 2022 Arniu Tseng and contributors
//!
//! Permission is hereby granted, free of charge, to any person obtaining a copy
//! of this software and associated documentation files (the "Software"), to deal
//! in the Software without restriction, including without limitation the rights
//! to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
//! copies of the Software, and to permit persons to whom the Software is
//! furnished to do so, subject to the following conditions:
//!
//! The above copyright notice and this permission notice shall be included in
//! all copies or substantial portions of the Software.
//!
//! THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
//! IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
//! FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
//! AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
//! LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
//! OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
//! THE SOFTWARE.

use nom::{
    IResult,
    branch::alt,
    bytes::complete::{is_not, tag, take_till},
    character::complete::{
        alpha1, alphanumeric1, char, multispace0, not_line_ending, one_of, space0, space1,
    },
    combinator::{map, map_parser, opt, recognize},
    multi::{many0, many0_count},
    sequence::{delimited, pair, preceded, separated_pair},
};
use turbo_rcstr::RcStr;
use turbo_tasks::FxIndexMap;

#[derive(Debug, PartialEq, Eq)]
enum Value<'a> {
    Lit(&'a str),
    Var(&'a str, Option<Box<Value<'a>>>),
    List(Vec<Value<'a>>),
}

type Pair<'a> = (&'a str, Value<'a>);

fn parse(input: &str) -> IResult<&str, Option<Pair<'_>>> {
    delimited(
        multispace0,
        alt((map(comment, |_| None), map(kv_pair, Some))),
        multispace0,
    )(input)
}

fn comment(input: &str) -> IResult<&str, &str> {
    preceded(char('#'), is_not("\n\r"))(input)
}

fn kv_pair(input: &str) -> IResult<&str, Pair<'_>> {
    let export_ = pair(tag("export"), space1);
    let _eq_ = delimited(space0, char('='), space0);
    preceded(opt(export_), separated_pair(key, _eq_, value))(input)
}

fn key(input: &str) -> IResult<&str, &str> {
    recognize(pair(
        alt((alpha1, tag("_"))),
        many0_count(alt((alphanumeric1, tag("_"), tag(".")))),
    ))(input)
}

fn value(input: &str) -> IResult<&str, Value<'_>> {
    alt((
        map(quoted_with('`'), Value::Lit),
        map(quoted_with('\''), Value::Lit),
        map_parser(quoted_with('"'), expand(true)),
        map_parser(simple_value, expand(false)), // LAST one
    ))(input)
}

fn simple_value(input: &str) -> IResult<&str, &str> {
    not_line_ending(input).map(|(_, text)| {
        let idx = text.find('#').unwrap_or(text.len());
        (&input[idx..], input[..idx].trim())
    })
}

fn quoted_with<'a>(mark: char) -> impl FnMut(&'a str) -> IResult<&'a str, &'a str> {
    delimited(char(mark), take_till(move |c| c == mark), char(mark))
}

fn expand<'a>(expand_new_lines: bool) -> impl FnMut(&'a str) -> IResult<&'a str, Value<'a>> {
    map(
        many0(alt((
            substitution,
            escape(expand_new_lines),
            map(is_not("\\$"), Value::Lit), // LAST one
        ))),
        Value::List,
    )
}

fn escape<'a>(expand_new_lines: bool) -> impl FnMut(&'a str) -> IResult<&'a str, Value<'a>> {
    let new_line = if expand_new_lines { "\n" } else { "\\n" };
    map(preceded(char('\\'), one_of("\\$n")), move |c| {
        Value::Lit(match c {
            '\\' => "\\",
            '$' => "$",
            'n' => new_line,
            _ => unreachable!(),
        })
    })
}

fn substitution(input: &str) -> IResult<&str, Value<'_>> {
    let default = alt((substitution, map(is_not("}"), Value::Lit)));

    alt((
        map(preceded(char('$'), key), |name| Value::Var(name, None)),
        map(
            delimited(
                tag("${"),
                pair(key, opt(preceded(tag(":-"), default))),
                tag("}"),
            ),
            |(name, maybe)| Value::Var(name, maybe.map(Box::new)),
        ),
    ))(input)
}

fn strip_bom(input: &str) -> &str {
    // https://www.unicode.org/faq/utf_bom.html
    input.strip_prefix('\u{FEFF}').unwrap_or(input)
}

/// `std::env` lookups are case-insensitive on Windows (`Path` satisfies
/// `$PATH`); match that so expansion and no-overwrite semantics don't change
/// between platforms.
fn vars_get<'m>(vars: &'m FxIndexMap<RcStr, RcStr>, name: &str) -> Option<&'m RcStr> {
    if let Some(v) = vars.get(name) {
        return Some(v);
    }
    #[cfg(windows)]
    {
        vars.iter()
            .find(|(k, _)| k.eq_ignore_ascii_case(name))
            .map(|(_, v)| v)
    }
    #[cfg(not(windows))]
    None
}

fn resolve(value: &Value<'_>, vars: &FxIndexMap<RcStr, RcStr>) -> Option<String> {
    match value {
        Value::Lit(text) => Some(text.to_string()),
        Value::Var(name, default) => vars_get(vars, name)
            .map(|v| v.to_string())
            .or_else(|| default.as_deref().and_then(|it| resolve(it, vars))),
        Value::List(list) => Some(
            list.iter()
                .flat_map(|it| resolve(it, vars))
                .collect::<String>(),
        ),
    }
}

/// Parse `input` as a dotenv file, inserting resolved variables into `vars`
/// (which is expected to already contain the prior environment).
///
/// Substitution resolves `$VAR`/`${VAR}`/`${VAR:-default}` against `vars`
/// itself — i.e. the prior environment plus variables defined earlier in this
/// file. Entries whose value can't be resolved are skipped; the first
/// definition of a key wins; parsing stops silently at the first unparsable
/// line. This matches the semantics of the `dotenvs` iterator driven with the
/// global environment set to the prior state.
/// The OS environment is case-insensitive on Windows and collapses
/// case-variant duplicates (the later entry wins). Mirror that on a prior map
/// before parsing, so `$Path`/`$PATH` see the same value the process would.
#[cfg(windows)]
pub fn dedupe_case_insensitive(vars: &mut FxIndexMap<RcStr, RcStr>) {
    let mut deduped = FxIndexMap::default();
    for (k, v) in vars.drain(..) {
        if let Some(existing) = deduped
            .keys()
            .find(|ek| ek.eq_ignore_ascii_case(&k))
            .map(|k| k.clone())
        {
            deduped.shift_remove(&existing);
        }
        deduped.insert(k, v);
    }
    *vars = deduped;
}

pub fn parse_dotenv_into(input: &str, vars: &mut FxIndexMap<RcStr, RcStr>) {
    let mut input = strip_bom(input);
    while let Ok((rest, maybe)) = parse(input) {
        input = rest;

        if let Some((key, value)) = maybe
            && let Some(value) = resolve(&value, vars)
        {
            if vars_get(vars, key).is_none() {
                vars.insert(key.into(), value.into());
            }
        }

        if rest.is_empty() {
            break;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{GLOBAL_ENV_LOCK, sorted_env_vars};

    fn parse(input: &str, prior: &[(&str, &str)]) -> Vec<(String, String)> {
        let mut vars: FxIndexMap<RcStr, RcStr> = prior
            .iter()
            .map(|(k, v)| ((*k).into(), (*v).into()))
            .collect();
        parse_dotenv_into(input, &mut vars);
        vars.sort_keys();
        vars.iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect()
    }

    /// Replicates the previous implementation: set the global env to `prior`,
    /// run dotenvs' own loader (which resolves `$VAR` through std::env), then
    /// restore. Only used to prove the new parser is behavior-identical.
    fn dotenvs_reference(input: &str, prior: &[(&str, &str)]) -> Vec<(String, String)> {
        let _lock = GLOBAL_ENV_LOCK.lock().unwrap();
        let initial = sorted_env_vars();

        let restore = |from: &FxIndexMap<RcStr, RcStr>, to: &FxIndexMap<RcStr, RcStr>| {
            for key in from.keys() {
                if !to.contains_key(key) {
                    unsafe { std::env::remove_var(key) };
                }
            }
            for (key, value) in to {
                match from.get(key) {
                    Some(v) if v == value => {}
                    _ => unsafe { std::env::set_var(key, value) },
                }
            }
        };

        let mut prior_map: FxIndexMap<RcStr, RcStr> = FxIndexMap::default();
        for (k, v) in prior {
            prior_map.insert((*k).into(), (*v).into());
        }

        restore(&initial, &prior_map);
        ::dotenv::from_read(input.as_bytes()).unwrap().load();
        let vars = sorted_env_vars();
        restore(&vars, &initial);

        vars.iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect()
    }

    const CASES: &[&str] = &[
        "FOO=bar",
        "FOO=bar\nBAZ=qux\n",
        "# comment\nFOO=bar # trailing\n",
        "export FOO=bar",
        "FOO=\n",
        "FOO='single quoted'",
        "FOO=\"double quoted\"",
        "FOO=`backtick $NOTRESOLVED`",
        "FOO=\"with\\nnewline\"",
        "FOO='no\\nescape'",
        "FOO=pre$PRIOR postsuffix",
        "FOO=$FILEEARLIER\nFILEEARLIER=later-wins-not",
        "FILEEARLIER=first\nFOO=$FILEEARLIER",
        "FOO=${PRIOR:-default}",
        "FOO=${UNDEFINED_PLACEHOLDER:-defaulted}",
        "FOO=${UNDEFINED_PLACEHOLDER}",
        "FOO=$UNDEFINED_PLACEHOLDER",
        "FOO=bar\nFOO=second",
        "FOO=bar\nnot a valid line\nBAZ=qux",
        "\u{FEFF}FOO=bar",
        "PRIOR=filewins\nOTHER=$PRIOR",
        "A=1\nB=$A$C\nC=2",
        "EMPTY=\nUSES_EMPTY=${EMPTY:-fallback}\nUSES_EMPTY2=${EMPTY:-}",
    ];

    const PRIOR: &[(&str, &str)] = &[
        ("PRIOR", "prior-value"),
        ("FILEEARLIER", "prior-fileearlier"),
        ("C", "prior-c"),
    ];

    #[test]
    fn matches_dotenvs_semantics() {
        for (i, input) in CASES.iter().enumerate() {
            let mine = parse(input, PRIOR);
            let reference = dotenvs_reference(input, PRIOR);
            assert_eq!(
                mine, reference,
                "case {i} differs: {input:?}\nmine:      {mine:?}\nreference: {reference:?}"
            );
        }
    }

    // std::env is case-insensitive on Windows; vars_get must match that.
    #[cfg(windows)]
    #[test]
    fn windows_lookup_is_case_insensitive() {
        let mut vars: FxIndexMap<RcStr, RcStr> = FxIndexMap::default();
        vars.insert("Path".into(), "C:\\bin".into());

        // Substitution lookup: $PATH finds the `Path` key.
        assert_eq!(vars_get(&vars, "PATH").map(|v| v.as_str()), Some("C:\\bin"));

        // First-wins / no-overwrite is also case-insensitive: `PATH=...` does
        // not shadow or duplicate the existing `Path` key.
        parse_dotenv_into("PATH=other", &mut vars);
        assert_eq!(vars.len(), 1);
        assert_eq!(vars.get("Path").map(|v| v.as_str()), Some("C:\\bin"));

        // Case-variant duplicates in the prior map collapse to the later
        // entry, like the OS environment.
        let mut dupes: FxIndexMap<RcStr, RcStr> = FxIndexMap::default();
        dupes.insert("Path".into(), "C:\\old".into());
        dupes.insert("PATH".into(), "C:\\new".into());
        dedupe_case_insensitive(&mut dupes);
        assert_eq!(dupes.len(), 1);
        assert_eq!(
            vars_get(&dupes, "path").map(|v| v.as_str()),
            Some("C:\\new")
        );
    }

    #[test]
    fn does_not_touch_the_global_env() {
        let _lock = GLOBAL_ENV_LOCK.lock().unwrap();
        let before = sorted_env_vars();
        let input = "DS_TEST_A=foo\nDS_TEST_B=$DS_TEST_A\nDS_TEST_C=${DS_TEST_MISSING:-d}";
        let out = parse(input, &[]);
        assert_eq!(
            out,
            vec![
                ("DS_TEST_A".to_string(), "foo".to_string()),
                ("DS_TEST_B".to_string(), "foo".to_string()),
                ("DS_TEST_C".to_string(), "d".to_string()),
            ]
        );
        let after = sorted_env_vars();
        assert_eq!(before, after, "global environment was mutated");
    }
}
