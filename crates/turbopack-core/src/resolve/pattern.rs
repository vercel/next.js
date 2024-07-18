use std::{collections::HashSet, fmt::Display, mem::take};

use anyhow::Result;
use lazy_static::lazy_static;
use regex::Regex;
use serde::{Deserialize, Serialize};
use tracing::Instrument;
use turbo_tasks::{trace::TraceRawVcs, RcStr, Value, ValueToString, Vc};
use turbo_tasks_fs::{
    DirectoryContent, DirectoryEntry, FileSystemEntryType, FileSystemPath, LinkContent, LinkType,
};

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(Hash, Clone, Debug, Default)]
pub enum Pattern {
    Constant(RcStr),
    #[default]
    Dynamic,
    Alternatives(Vec<Pattern>),
    Concatenation(Vec<Pattern>),
}

fn concatenation_push_or_merge_item(list: &mut Vec<Pattern>, pat: Pattern) {
    if let Pattern::Constant(ref s) = pat {
        if let Some(Pattern::Constant(ref mut last)) = list.last_mut() {
            let mut buf = last.to_string();
            buf.push_str(s);
            *last = buf.into();
            return;
        }
    }
    list.push(pat);
}

fn concatenation_push_front_or_merge_item(list: &mut Vec<Pattern>, pat: Pattern) {
    if let Pattern::Constant(s) = pat {
        if let Some(Pattern::Constant(ref mut first)) = list.iter_mut().next() {
            let mut buf = s.into_owned();
            buf.push_str(first);

            *first = buf.into();
            return;
        }
        list.insert(0, Pattern::Constant(s));
    } else {
        list.insert(0, pat);
    }
}

fn concatenation_extend_or_merge_items(
    list: &mut Vec<Pattern>,
    mut iter: impl Iterator<Item = Pattern>,
) {
    if let Some(first) = iter.next() {
        concatenation_push_or_merge_item(list, first);
        list.extend(iter);
    }
}

impl Pattern {
    // TODO this should be removed in favor of pattern resolving
    pub fn into_string(self) -> Option<RcStr> {
        match self {
            Pattern::Constant(str) => Some(str),
            _ => None,
        }
    }

    pub fn as_string(&self) -> Option<&str> {
        match self {
            Pattern::Constant(str) => Some(str.as_str()),
            _ => None,
        }
    }

    pub fn has_constant_parts(&self) -> bool {
        match self {
            Pattern::Constant(_) => true,
            Pattern::Dynamic => false,
            Pattern::Alternatives(list) | Pattern::Concatenation(list) => {
                list.iter().any(|p| p.has_constant_parts())
            }
        }
    }

    pub fn extend(&mut self, concatenated: impl Iterator<Item = Self>) {
        if let Pattern::Concatenation(list) = self {
            concatenation_extend_or_merge_items(list, concatenated);
        } else {
            let mut vec = vec![take(self)];
            for item in concatenated {
                if let Pattern::Concatenation(more) = item {
                    concatenation_extend_or_merge_items(&mut vec, more.into_iter());
                } else {
                    concatenation_push_or_merge_item(&mut vec, item);
                }
            }
            *self = Pattern::Concatenation(vec);
        }
    }

    pub fn push(&mut self, pat: Pattern) {
        match (self, pat) {
            (Pattern::Concatenation(list), Pattern::Concatenation(more)) => {
                concatenation_extend_or_merge_items(list, more.into_iter());
            }
            (Pattern::Concatenation(list), pat) => {
                concatenation_push_or_merge_item(list, pat);
            }
            (this, Pattern::Concatenation(mut list)) => {
                concatenation_push_front_or_merge_item(&mut list, take(this));
                *this = Pattern::Concatenation(list);
            }
            (Pattern::Constant(str), Pattern::Constant(other)) => {
                let mut buf = str.to_string();
                buf.push_str(&other);
                *str = buf.into();
            }
            (this, pat) => {
                *this = Pattern::Concatenation(vec![take(this), pat]);
            }
        }
    }

    pub fn push_front(&mut self, pat: Pattern) {
        match (self, pat) {
            (Pattern::Concatenation(list), Pattern::Concatenation(mut more)) => {
                concatenation_extend_or_merge_items(&mut more, take(list).into_iter());
                *list = more;
            }
            (Pattern::Concatenation(ref mut list), pat) => {
                concatenation_push_front_or_merge_item(list, pat);
            }
            (this, Pattern::Concatenation(mut list)) => {
                concatenation_push_or_merge_item(&mut list, take(this));
                *this = Pattern::Concatenation(list);
            }
            (Pattern::Constant(str), Pattern::Constant(other)) => {
                let mut buf = other.into_owned();

                buf.push_str(str);
                *str = buf.into();
            }
            (this, pat) => {
                *this = Pattern::Concatenation(vec![pat, take(this)]);
            }
        }
    }

    pub fn alternatives(alts: impl IntoIterator<Item = Pattern>) -> Self {
        let mut list = Vec::new();
        for alt in alts {
            if let Pattern::Alternatives(inner) = alt {
                list.extend(inner);
            } else {
                list.push(alt)
            }
        }
        Self::Alternatives(list)
    }

    pub fn concat(items: impl IntoIterator<Item = Pattern>) -> Self {
        let mut items = items.into_iter();
        let mut current = items.next().unwrap_or_default();
        for item in items {
            current.push(item);
        }
        current
    }

    /// Order into Alternatives -> Concatenation -> Constant/Dynamic
    /// Merge when possible
    pub fn normalize(&mut self) {
        let mut alternatives = [Vec::new()];
        match self {
            Pattern::Constant(c) => {
                for alt in alternatives.iter_mut() {
                    alt.push(Pattern::Constant(c.clone()));
                }
            }
            Pattern::Dynamic => {
                for alt in alternatives.iter_mut() {
                    alt.push(Pattern::Dynamic);
                }
            }
            Pattern::Alternatives(list) => {
                for alt in list.iter_mut() {
                    alt.normalize();
                }
                let mut new_alternatives = Vec::new();
                for alt in list.drain(..) {
                    if let Pattern::Alternatives(inner) = alt {
                        for alt in inner {
                            new_alternatives.push(alt);
                        }
                    } else {
                        new_alternatives.push(alt);
                    }
                }
                *list = new_alternatives;
            }
            Pattern::Concatenation(list) => {
                let mut has_alternatives = false;
                for part in list.iter_mut() {
                    part.normalize();
                    if let Pattern::Alternatives(_) = part {
                        has_alternatives = true;
                    }
                }
                if has_alternatives {
                    // list has items that are one of these
                    // * Alternatives -> [Concatenation] -> ...
                    // * [Concatenation] -> ...
                    let mut new_alternatives: Vec<Vec<Pattern>> = vec![Vec::new()];
                    for part in list.drain(..) {
                        if let Pattern::Alternatives(list) = part {
                            // list is [Concatenation] -> ...
                            let mut combined = Vec::new();
                            for alt2 in list.iter() {
                                for mut alt in new_alternatives.clone() {
                                    if let Pattern::Concatenation(parts) = alt2 {
                                        alt.extend(parts.clone());
                                    } else {
                                        alt.push(alt2.clone());
                                    }
                                    combined.push(alt)
                                }
                            }
                            new_alternatives = combined;
                        } else {
                            // part is [Concatenation] -> ...
                            for alt in new_alternatives.iter_mut() {
                                if let Pattern::Concatenation(ref parts) = part {
                                    alt.extend(parts.clone());
                                } else {
                                    alt.push(part.clone());
                                }
                            }
                        }
                    }
                    // new_alternatives has items in that form:
                    // * [Concatenation] -> ...
                    *self = Pattern::Alternatives(
                        new_alternatives
                            .into_iter()
                            .map(|parts| {
                                if parts.len() == 1 {
                                    parts.into_iter().next().unwrap()
                                } else {
                                    Pattern::Concatenation(parts)
                                }
                            })
                            .collect(),
                    );
                    self.normalize();
                } else {
                    let mut new_parts = Vec::new();
                    for part in list.drain(..) {
                        fn add_part(part: Pattern, new_parts: &mut Vec<Pattern>) {
                            match part {
                                Pattern::Constant(c) => {
                                    if !c.is_empty() {
                                        if let Some(Pattern::Constant(last)) = new_parts.last_mut()
                                        {
                                            let mut buf = last.to_string();
                                            buf.push_str(&c);
                                            *last = buf.into();
                                        } else {
                                            new_parts.push(Pattern::Constant(c));
                                        }
                                    }
                                }
                                Pattern::Dynamic => {
                                    if let Some(Pattern::Dynamic) = new_parts.last() {
                                        // do nothing
                                    } else {
                                        new_parts.push(Pattern::Dynamic);
                                    }
                                }
                                Pattern::Concatenation(parts) => {
                                    for part in parts {
                                        add_part(part, new_parts);
                                    }
                                }
                                Pattern::Alternatives(_) => unreachable!(),
                            }
                        }

                        add_part(part, &mut new_parts);
                    }
                    if new_parts.len() == 1 {
                        *self = new_parts.into_iter().next().unwrap();
                    } else {
                        *list = new_parts;
                    }
                }
            }
        }
    }

    pub fn filter_could_match(&self, value: &str) -> Option<Pattern> {
        if let Pattern::Alternatives(list) = self {
            let new_list = list
                .iter()
                .filter(|alt| alt.could_match(value))
                .cloned()
                .collect::<Vec<_>>();
            if new_list.is_empty() {
                None
            } else {
                Some(Pattern::Alternatives(new_list))
            }
        } else if self.could_match(value) {
            Some(self.clone())
        } else {
            None
        }
    }

    pub fn filter_could_not_match(&self, value: &str) -> Option<Pattern> {
        if let Pattern::Alternatives(list) = self {
            let new_list = list
                .iter()
                .filter(|alt| !alt.could_match(value))
                .cloned()
                .collect::<Vec<_>>();
            if new_list.is_empty() {
                None
            } else {
                Some(Pattern::Alternatives(new_list))
            }
        } else if self.could_match(value) {
            None
        } else {
            Some(self.clone())
        }
    }

    pub fn split_could_match(&self, value: &str) -> (Option<Pattern>, Option<Pattern>) {
        if let Pattern::Alternatives(list) = self {
            let mut could_match_list = Vec::new();
            let mut could_not_match_list = Vec::new();
            for alt in list.iter() {
                if alt.could_match(value) {
                    could_match_list.push(alt.clone());
                } else {
                    could_not_match_list.push(alt.clone());
                }
            }
            (
                if could_match_list.is_empty() {
                    None
                } else if could_match_list.len() == 1 {
                    Some(could_match_list.into_iter().next().unwrap())
                } else {
                    Some(Pattern::Alternatives(could_match_list))
                },
                if could_not_match_list.is_empty() {
                    None
                } else if could_not_match_list.len() == 1 {
                    Some(could_not_match_list.into_iter().next().unwrap())
                } else {
                    Some(Pattern::Alternatives(could_not_match_list))
                },
            )
        } else if self.could_match(value) {
            (Some(self.clone()), None)
        } else {
            (None, Some(self.clone()))
        }
    }

    pub fn is_match(&self, value: &str) -> bool {
        if let Pattern::Alternatives(list) = self {
            list.iter()
                .any(|alt| alt.match_internal(value, None, false).is_match())
        } else {
            self.match_internal(value, None, false).is_match()
        }
    }

    /// Like [`Pattern::is_match`], but does not consider any dynamic
    /// pattern matching
    pub fn is_match_ignore_dynamic(&self, value: &str) -> bool {
        if let Pattern::Alternatives(list) = self {
            list.iter()
                .any(|alt| alt.match_internal(value, None, true).is_match())
        } else {
            self.match_internal(value, None, true).is_match()
        }
    }

    pub fn match_position(&self, value: &str) -> Option<usize> {
        if let Pattern::Alternatives(list) = self {
            list.iter()
                .position(|alt| alt.match_internal(value, None, false).is_match())
        } else {
            self.match_internal(value, None, false)
                .is_match()
                .then_some(0)
        }
    }

    pub fn could_match_others(&self, value: &str) -> bool {
        if let Pattern::Alternatives(list) = self {
            list.iter()
                .any(|alt| alt.match_internal(value, None, false).could_match_others())
        } else {
            self.match_internal(value, None, false).could_match_others()
        }
    }

    /// Returns true the pattern could match something that starts with `value`.
    pub fn could_match(&self, value: &str) -> bool {
        if let Pattern::Alternatives(list) = self {
            list.iter()
                .any(|alt| alt.match_internal(value, None, false).could_match())
        } else {
            self.match_internal(value, None, false).could_match()
        }
    }

    pub fn could_match_position(&self, value: &str) -> Option<usize> {
        if let Pattern::Alternatives(list) = self {
            list.iter()
                .position(|alt| alt.match_internal(value, None, false).could_match())
        } else {
            self.match_internal(value, None, false)
                .could_match()
                .then_some(0)
        }
    }

    fn match_internal<'a>(
        &self,
        mut value: &'a str,
        mut any_offset: Option<usize>,
        ignore_dynamic: bool,
    ) -> MatchResult<'a> {
        match self {
            Pattern::Constant(c) => {
                if let Some(offset) = any_offset {
                    if let Some(index) = value.find(&**c) {
                        if index <= offset {
                            MatchResult::Consumed {
                                remaining: &value[index + c.len()..],
                                any_offset: None,
                            }
                        } else {
                            MatchResult::None
                        }
                    } else if offset >= value.len() {
                        MatchResult::Partial
                    } else {
                        MatchResult::None
                    }
                } else if value.starts_with(&**c) {
                    MatchResult::Consumed {
                        remaining: &value[c.len()..],
                        any_offset: None,
                    }
                } else if c.starts_with(value) {
                    MatchResult::Partial
                } else {
                    MatchResult::None
                }
            }
            Pattern::Dynamic => {
                lazy_static! {
                    static ref FORBIDDEN: Regex =
                        Regex::new(r"(/|^)(ROOT|\.|/|(node_modules|__tests?__)(/|$))").unwrap();
                    static ref FORBIDDEN_MATCH: Regex = Regex::new(r"\.d\.ts$|\.map$").unwrap();
                }
                if let Some(m) = FORBIDDEN.find(value) {
                    MatchResult::Consumed {
                        remaining: value,
                        any_offset: Some(m.start()),
                    }
                } else if FORBIDDEN_MATCH.find(value).is_some() {
                    MatchResult::Partial
                } else if ignore_dynamic {
                    MatchResult::None
                } else {
                    MatchResult::Consumed {
                        remaining: value,
                        any_offset: Some(value.len()),
                    }
                }
            }
            Pattern::Alternatives(_) => {
                panic!("for matching a Pattern must be normalized {:?}", self)
            }
            Pattern::Concatenation(list) => {
                for part in list {
                    match part.match_internal(value, any_offset, ignore_dynamic) {
                        MatchResult::None => return MatchResult::None,
                        MatchResult::Partial => return MatchResult::Partial,
                        MatchResult::Consumed {
                            remaining: new_value,
                            any_offset: new_any_offset,
                        } => {
                            value = new_value;
                            any_offset = new_any_offset;
                        }
                    }
                }
                MatchResult::Consumed {
                    remaining: value,
                    any_offset,
                }
            }
        }
    }

    pub fn next_constants<'a>(&'a self, value: &str) -> Option<Vec<(&'a str, bool)>> {
        if let Pattern::Alternatives(list) = self {
            let mut results = Vec::new();
            for alt in list.iter() {
                match alt.next_constants_internal(value, None) {
                    NextConstantUntilResult::NoMatch => {}
                    NextConstantUntilResult::PartialDynamic => {
                        return None;
                    }
                    NextConstantUntilResult::Partial(s, end) => {
                        results.push((s, end));
                    }
                    NextConstantUntilResult::Consumed(rem, None) => {
                        if rem.is_empty() {
                            results.push(("", true));
                        }
                    }
                    NextConstantUntilResult::Consumed(rem, Some(any)) => {
                        if any == rem.len() {
                            // can match anything
                            // we don't have constant only matches
                            return None;
                        }
                    }
                }
            }
            Some(results)
        } else {
            match self.next_constants_internal(value, None) {
                NextConstantUntilResult::NoMatch => None,
                NextConstantUntilResult::PartialDynamic => None,
                NextConstantUntilResult::Partial(s, e) => Some(vec![(s, e)]),
                NextConstantUntilResult::Consumed(_, _) => None,
            }
        }
    }

    fn next_constants_internal<'a, 'b>(
        &'a self,
        mut value: &'b str,
        mut any_offset: Option<usize>,
    ) -> NextConstantUntilResult<'a, 'b> {
        match self {
            Pattern::Constant(c) => {
                if let Some(offset) = any_offset {
                    if let Some(index) = value.find(&**c) {
                        if index <= offset {
                            NextConstantUntilResult::Consumed(&value[index + c.len()..], None)
                        } else {
                            NextConstantUntilResult::NoMatch
                        }
                    } else if offset >= value.len() {
                        NextConstantUntilResult::PartialDynamic
                    } else {
                        NextConstantUntilResult::NoMatch
                    }
                } else if let Some(stripped) = value.strip_prefix(&**c) {
                    NextConstantUntilResult::Consumed(stripped, None)
                } else if let Some(stripped) = c.strip_prefix(value) {
                    NextConstantUntilResult::Partial(stripped, true)
                } else {
                    NextConstantUntilResult::NoMatch
                }
            }
            Pattern::Dynamic => {
                lazy_static! {
                    static ref FORBIDDEN: Regex =
                        Regex::new(r"(/|^)(\.|(node_modules|__tests?__)(/|$))").unwrap();
                    static ref FORBIDDEN_MATCH: Regex = Regex::new(r"\.d\.ts$|\.map$").unwrap();
                }
                if let Some(m) = FORBIDDEN.find(value) {
                    NextConstantUntilResult::Consumed(value, Some(m.start()))
                } else if FORBIDDEN_MATCH.find(value).is_some() {
                    NextConstantUntilResult::PartialDynamic
                } else {
                    NextConstantUntilResult::Consumed(value, Some(value.len()))
                }
            }
            Pattern::Alternatives(_) => {
                panic!("for next_constants() the Pattern must be normalized");
            }
            Pattern::Concatenation(list) => {
                let mut iter = list.iter();
                while let Some(part) = iter.next() {
                    match part.next_constants_internal(value, any_offset) {
                        NextConstantUntilResult::NoMatch => {
                            return NextConstantUntilResult::NoMatch
                        }
                        NextConstantUntilResult::PartialDynamic => {
                            return NextConstantUntilResult::PartialDynamic
                        }
                        NextConstantUntilResult::Partial(r, end) => {
                            return NextConstantUntilResult::Partial(
                                r,
                                end && iter.next().is_none(),
                            )
                        }
                        NextConstantUntilResult::Consumed(new_value, new_any_offset) => {
                            value = new_value;
                            any_offset = new_any_offset;
                        }
                    }
                }
                NextConstantUntilResult::Consumed(value, any_offset)
            }
        }
    }

    pub fn or_any_nested_file(&self) -> Self {
        let mut new = self.clone();
        new.push(Pattern::Constant("/".into()));
        new.push(Pattern::Dynamic);
        new.normalize();
        Pattern::alternatives([self.clone(), new])
    }
}

impl Pattern {
    pub fn new(pattern: Pattern) -> Vc<Self> {
        Pattern::new_internal(Value::new(pattern))
    }
}

#[turbo_tasks::value_impl]
impl Pattern {
    #[turbo_tasks::function]
    fn new_internal(pattern: Value<Pattern>) -> Vc<Self> {
        Self::cell(pattern.into_value())
    }
}

#[derive(PartialEq)]
enum MatchResult<'a> {
    /// No match
    None,
    /// Matches only a part of the pattern before reaching the end of the string
    Partial,
    /// Matches the whole pattern (but maybe not the whole string)
    Consumed {
        /// Part of the string remaining after matching the whole pattern
        remaining: &'a str,
        /// Set when the pattern ends with a dynamic part. The dynamic part
        /// could match n bytes more of the string.
        any_offset: Option<usize>,
    },
}

impl<'a> MatchResult<'a> {
    /// Returns true if the whole pattern matches the whole string
    fn is_match(&self) -> bool {
        match self {
            MatchResult::None => false,
            MatchResult::Partial => false,
            MatchResult::Consumed {
                remaining: rem,
                any_offset,
            } => {
                if let Some(offset) = any_offset {
                    *offset == rem.len()
                } else {
                    rem.is_empty()
                }
            }
        }
    }

    /// Returns true if (at least a part of) the pattern matches the whole
    /// string and can also match more bytes in the string
    fn could_match_others(&self) -> bool {
        match self {
            MatchResult::None => false,
            MatchResult::Partial => true,
            MatchResult::Consumed {
                remaining: rem,
                any_offset,
            } => {
                if let Some(offset) = any_offset {
                    *offset == rem.len()
                } else {
                    false
                }
            }
        }
    }

    /// Returns true if (at least a part of) the pattern matches the whole
    /// string
    fn could_match(&self) -> bool {
        match self {
            MatchResult::None => false,
            MatchResult::Partial => true,
            MatchResult::Consumed {
                remaining: rem,
                any_offset,
            } => {
                if let Some(offset) = any_offset {
                    *offset == rem.len()
                } else {
                    rem.is_empty()
                }
            }
        }
    }
}

#[derive(PartialEq)]
enum NextConstantUntilResult<'a, 'b> {
    NoMatch,
    PartialDynamic,
    Partial(&'a str, bool),
    Consumed(&'b str, Option<usize>),
}

impl From<RcStr> for Pattern {
    fn from(s: RcStr) -> Self {
        Pattern::Constant(s)
    }
}

impl Display for Pattern {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Pattern::Constant(c) => write!(f, "\"{c}\""),
            Pattern::Dynamic => write!(f, "<dynamic>"),
            Pattern::Alternatives(list) => write!(
                f,
                "({})",
                list.iter()
                    .map(|i| i.to_string())
                    .collect::<Vec<_>>()
                    .join(" | ")
            ),
            Pattern::Concatenation(list) => write!(
                f,
                "{}",
                list.iter()
                    .map(|i| i.to_string())
                    .collect::<Vec<_>>()
                    .join(" ")
            ),
        }
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for Pattern {
    #[turbo_tasks::function]
    fn to_string(&self) -> Vc<RcStr> {
        Vc::cell(self.to_string().into())
    }
}

#[derive(Debug, PartialEq, Eq, Clone, TraceRawVcs, Serialize, Deserialize)]
pub enum PatternMatch {
    File(RcStr, Vc<FileSystemPath>),
    Directory(RcStr, Vc<FileSystemPath>),
}

impl PatternMatch {
    pub fn path(&self) -> Vc<FileSystemPath> {
        match *self {
            PatternMatch::File(_, path) | PatternMatch::Directory(_, path) => path,
        }
    }

    pub fn name(&self) -> &str {
        match self {
            PatternMatch::File(name, _) | PatternMatch::Directory(name, _) => name.as_str(),
        }
    }
}

// TODO this isn't super efficient
// avoid storing a large list of matches
#[turbo_tasks::value(transparent)]
pub struct PatternMatches(Vec<PatternMatch>);

/// Find all files or directories that match the provided `pattern` with the
/// specified `lookup_dir` directory. `prefix` is the already matched part of
/// the pattern that leads to the `lookup_dir` directory. When
/// `force_in_lookup_dir` is set, leaving the `lookup_dir` directory by
/// matching `..` is not allowed.
///
/// Symlinks will not be resolved. It's expected that the caller resolves
/// symlinks when they are interested in that.
#[turbo_tasks::function]
pub async fn read_matches(
    lookup_dir: Vc<FileSystemPath>,
    prefix: RcStr,
    force_in_lookup_dir: bool,
    pattern: Vc<Pattern>,
) -> Result<Vc<PatternMatches>> {
    let mut prefix = prefix.to_string();
    let pat = pattern.await?;
    let mut results = Vec::new();
    let mut nested = Vec::new();
    let slow_path = if let Some(constants) = pat.next_constants(&prefix) {
        if constants
            .iter()
            .all(|(str, until_end)| *until_end || str.contains('/'))
        {
            // Fast path: There is a finite list of possible strings that include at least
            // one path segment We will enumerate the list instead of the
            // directory
            let mut handled = HashSet::new();
            for (index, (str, until_end)) in constants.into_iter().enumerate() {
                if until_end {
                    if handled.insert(str) {
                        if let Some(fs_path) = &*if force_in_lookup_dir {
                            lookup_dir.try_join_inside(str.into()).await?
                        } else {
                            lookup_dir.try_join(str.into()).await?
                        } {
                            let fs_path = fs_path.resolve().await?;
                            // This explicit deref of `context` is necessary
                            #[allow(clippy::explicit_auto_deref)]
                            let should_match = !force_in_lookup_dir
                                || fs_path.await?.is_inside_ref(&*lookup_dir.await?);

                            if should_match {
                                let len = prefix.len();
                                prefix.push_str(str);
                                match *fs_path.get_type().await? {
                                    FileSystemEntryType::File => {
                                        results.push((
                                            index,
                                            PatternMatch::File(prefix.clone().into(), fs_path),
                                        ));
                                    }
                                    FileSystemEntryType::Directory => results.push((
                                        index,
                                        PatternMatch::Directory(prefix.clone().into(), fs_path),
                                    )),
                                    FileSystemEntryType::Symlink => {
                                        if let LinkContent::Link { link_type, .. } =
                                            &*fs_path.read_link().await?
                                        {
                                            if link_type.contains(LinkType::DIRECTORY) {
                                                results.push((
                                                    index,
                                                    PatternMatch::Directory(
                                                        prefix.clone().into(),
                                                        fs_path,
                                                    ),
                                                ));
                                            } else {
                                                results.push((
                                                    index,
                                                    PatternMatch::File(
                                                        prefix.clone().into(),
                                                        fs_path,
                                                    ),
                                                ))
                                            }
                                        }
                                    }
                                    _ => {}
                                }
                                prefix.truncate(len);
                            }
                        }
                    }
                } else {
                    let subpath = &str[..=str.rfind('/').unwrap()];
                    if handled.insert(subpath) {
                        if let Some(fs_path) = &*if force_in_lookup_dir {
                            lookup_dir.try_join_inside(subpath.into()).await?
                        } else {
                            lookup_dir.try_join(subpath.into()).await?
                        } {
                            let fs_path = fs_path.resolve().await?;
                            let len = prefix.len();
                            prefix.push_str(subpath);
                            nested.push((
                                0,
                                read_matches(
                                    fs_path,
                                    prefix.clone().into(),
                                    force_in_lookup_dir,
                                    pattern,
                                ),
                            ));
                            prefix.truncate(len);
                        }
                    }
                }
            }
            false
        } else {
            true
        }
    } else {
        true
    };

    if slow_path {
        async {
            // Slow path: There are infinite matches for the pattern
            // We will enumerate the filesystem to find matches
            if !force_in_lookup_dir {
                // {prefix}..
                prefix.push_str("..");
                if let Some(pos) = pat.match_position(&prefix) {
                    results.push((
                        pos,
                        PatternMatch::Directory(prefix.clone().into(), lookup_dir.parent()),
                    ));
                }

                // {prefix}../
                prefix.push('/');
                if let Some(pos) = pat.match_position(&prefix) {
                    results.push((
                        pos,
                        PatternMatch::Directory(prefix.clone().into(), lookup_dir.parent()),
                    ));
                }
                if let Some(pos) = pat.could_match_position(&prefix) {
                    nested.push((
                        pos,
                        read_matches(lookup_dir.parent(), prefix.clone().into(), false, pattern),
                    ));
                }
                prefix.pop();
                prefix.pop();
                prefix.pop();
            }
            {
                prefix.push('.');
                // {prefix}.
                if let Some(pos) = pat.match_position(&prefix) {
                    results.push((
                        pos,
                        PatternMatch::Directory(prefix.clone().into(), lookup_dir),
                    ));
                }
                prefix.pop();
            }
            if prefix.is_empty() {
                if let Some(pos) = pat.match_position("./") {
                    results.push((pos, PatternMatch::Directory("./".into(), lookup_dir)));
                }
                if let Some(pos) = pat.could_match_position("./") {
                    nested.push((pos, read_matches(lookup_dir, "./".into(), false, pattern)));
                }
            } else {
                prefix.push('/');
                // {prefix}/
                if let Some(pos) = pat.could_match_position(&prefix) {
                    nested.push((
                        pos,
                        read_matches(lookup_dir, prefix.to_string().into(), false, pattern),
                    ));
                }
                prefix.pop();
                prefix.push_str("./");
                // {prefix}./
                if let Some(pos) = pat.could_match_position(&prefix) {
                    nested.push((
                        pos,
                        read_matches(lookup_dir, prefix.to_string().into(), false, pattern),
                    ));
                }
                prefix.pop();
                prefix.pop();
            }
            match &*lookup_dir.read_dir().await? {
                DirectoryContent::Entries(map) => {
                    for (key, entry) in map.iter() {
                        match entry {
                            DirectoryEntry::File(path) => {
                                let len = prefix.len();
                                prefix.push_str(key);
                                // {prefix}{key}
                                if let Some(pos) = pat.match_position(&prefix) {
                                    results.push((
                                        pos,
                                        PatternMatch::File(prefix.clone().into(), *path),
                                    ));
                                }
                                prefix.truncate(len)
                            }
                            DirectoryEntry::Directory(path) => {
                                let len = prefix.len();
                                prefix.push_str(key);
                                // {prefix}{key}
                                if prefix.ends_with('/') {
                                    prefix.pop();
                                }
                                if let Some(pos) = pat.match_position(&prefix) {
                                    results.push((
                                        pos,
                                        PatternMatch::Directory(prefix.clone().into(), *path),
                                    ));
                                }
                                prefix.push('/');
                                // {prefix}{key}/
                                if let Some(pos) = pat.match_position(&prefix) {
                                    results.push((
                                        pos,
                                        PatternMatch::Directory(prefix.clone().into(), *path),
                                    ));
                                }
                                if let Some(pos) = pat.could_match_position(&prefix) {
                                    nested.push((
                                        pos,
                                        read_matches(*path, prefix.clone().into(), true, pattern),
                                    ));
                                }
                                prefix.truncate(len)
                            }
                            DirectoryEntry::Symlink(fs_path) => {
                                let len = prefix.len();
                                prefix.push_str(key);
                                // {prefix}{key}
                                if prefix.ends_with('/') {
                                    prefix.pop();
                                }
                                if let Some(pos) = pat.match_position(&prefix) {
                                    if let LinkContent::Link { link_type, .. } =
                                        &*fs_path.read_link().await?
                                    {
                                        if link_type.contains(LinkType::DIRECTORY) {
                                            results.push((
                                                pos,
                                                PatternMatch::Directory(
                                                    prefix.clone().into(),
                                                    *fs_path,
                                                ),
                                            ));
                                        } else {
                                            results.push((
                                                pos,
                                                PatternMatch::File(prefix.clone().into(), *fs_path),
                                            ));
                                        }
                                    }
                                }
                                prefix.push('/');
                                if let Some(pos) = pat.match_position(&prefix) {
                                    if let LinkContent::Link { link_type, .. } =
                                        &*fs_path.read_link().await?
                                    {
                                        if link_type.contains(LinkType::DIRECTORY) {
                                            results.push((
                                                pos,
                                                PatternMatch::Directory(
                                                    prefix.clone().into(),
                                                    *fs_path,
                                                ),
                                            ));
                                        }
                                    }
                                }
                                if let Some(pos) = pat.could_match_position(&prefix) {
                                    if let LinkContent::Link { link_type, .. } =
                                        &*fs_path.read_link().await?
                                    {
                                        if link_type.contains(LinkType::DIRECTORY) {
                                            results.push((
                                                pos,
                                                PatternMatch::Directory(
                                                    prefix.clone().into(),
                                                    *fs_path,
                                                ),
                                            ));
                                        }
                                    }
                                }
                                prefix.truncate(len)
                            }
                            DirectoryEntry::Other(_) => {}
                            DirectoryEntry::Error => {}
                        }
                    }
                }
                DirectoryContent::NotFound => {}
            };
            anyhow::Ok(())
        }
        .instrument(tracing::trace_span!("read_matches slow_path"))
        .await?;
    }
    if results.is_empty() && nested.len() == 1 {
        Ok(nested.into_iter().next().unwrap().1)
    } else {
        for (pos, nested) in nested.into_iter() {
            results.extend(nested.await?.iter().cloned().map(|p| (pos, p)));
        }
        results.sort_by(|(a, am), (b, bm)| (*a).cmp(b).then_with(|| am.name().cmp(bm.name())));
        Ok(Vc::cell(
            results.into_iter().map(|(_, p)| p).collect::<Vec<_>>(),
        ))
    }
}

#[cfg(test)]
mod tests {
    use rstest::*;

    use super::Pattern;

    #[test]
    fn normalize() {
        let a = Pattern::Constant("a".into());
        let b = Pattern::Constant("b".into());
        let c = Pattern::Constant("c".into());
        let s = Pattern::Constant("/".into());
        let d = Pattern::Dynamic;
        {
            let mut p = Pattern::Concatenation(vec![
                Pattern::Alternatives(vec![a.clone(), b.clone()]),
                s.clone(),
                c.clone(),
            ]);
            p.normalize();
            assert_eq!(
                p,
                Pattern::Alternatives(vec![
                    Pattern::Constant("a/c".into()),
                    Pattern::Constant("b/c".into()),
                ])
            );
        }

        #[allow(clippy::redundant_clone)] // alignment
        {
            let mut p = Pattern::Concatenation(vec![
                Pattern::Alternatives(vec![a.clone(), b.clone(), d.clone()]),
                s.clone(),
                Pattern::Alternatives(vec![b.clone(), c.clone(), d.clone()]),
            ]);
            p.normalize();

            assert_eq!(
                p,
                Pattern::Alternatives(vec![
                    Pattern::Constant("a/b".into()),
                    Pattern::Constant("b/b".into()),
                    Pattern::Concatenation(vec![Pattern::Dynamic, Pattern::Constant("/b".into())]),
                    Pattern::Constant("a/c".into()),
                    Pattern::Constant("b/c".into()),
                    Pattern::Concatenation(vec![Pattern::Dynamic, Pattern::Constant("/c".into())]),
                    Pattern::Concatenation(vec![Pattern::Constant("a/".into()), Pattern::Dynamic]),
                    Pattern::Concatenation(vec![Pattern::Constant("b/".into()), Pattern::Dynamic]),
                    Pattern::Concatenation(vec![
                        Pattern::Dynamic,
                        Pattern::Constant("/".into()),
                        Pattern::Dynamic
                    ]),
                ])
            );
        }
    }

    #[test]
    fn is_match() {
        let pat = Pattern::Concatenation(vec![
            Pattern::Constant(".".into()),
            Pattern::Constant("/".into()),
            Pattern::Dynamic,
            Pattern::Constant(".js".into()),
        ]);
        assert!(pat.could_match(""));
        assert!(pat.could_match("./"));
        assert!(!pat.is_match("./"));
        assert!(pat.is_match("./index.js"));
        assert!(!pat.is_match("./index"));

        // forbidden:
        assert!(!pat.is_match("./../index.js"));
        assert!(!pat.is_match("././index.js"));
        assert!(!pat.is_match("./.git/index.js"));
        assert!(!pat.is_match("./inner/../index.js"));
        assert!(!pat.is_match("./inner/./index.js"));
        assert!(!pat.is_match("./inner/.git/index.js"));
        assert!(!pat.could_match("./../"));
        assert!(!pat.could_match("././"));
        assert!(!pat.could_match("./.git/"));
        assert!(!pat.could_match("./inner/../"));
        assert!(!pat.could_match("./inner/./"));
        assert!(!pat.could_match("./inner/.git/"));
    }

    #[rstest]
    #[case::dynamic(Pattern::Dynamic)]
    #[case::dynamic_concat(Pattern::Concatenation(vec![Pattern::Dynamic, Pattern::Constant(".js".into())]))]
    fn dynamic_match(#[case] pat: Pattern) {
        assert!(pat.could_match(""));
        assert!(pat.is_match("index.js"));

        // forbidden:
        assert!(!pat.could_match("./"));
        assert!(!pat.is_match("./"));
        assert!(!pat.could_match("."));
        assert!(!pat.is_match("."));
        assert!(!pat.could_match("../"));
        assert!(!pat.is_match("../"));
        assert!(!pat.could_match(".."));
        assert!(!pat.is_match(".."));
        assert!(!pat.is_match("./../index.js"));
        assert!(!pat.is_match("././index.js"));
        assert!(!pat.is_match("./.git/index.js"));
        assert!(!pat.is_match("./inner/../index.js"));
        assert!(!pat.is_match("./inner/./index.js"));
        assert!(!pat.is_match("./inner/.git/index.js"));
        assert!(!pat.could_match("./../"));
        assert!(!pat.could_match("././"));
        assert!(!pat.could_match("./.git/"));
        assert!(!pat.could_match("./inner/../"));
        assert!(!pat.could_match("./inner/./"));
        assert!(!pat.could_match("./inner/.git/"));
        assert!(!pat.could_match("dir//"));
        assert!(!pat.could_match("dir//dir"));
        assert!(!pat.could_match("dir///dir"));
        assert!(!pat.could_match("/"));
        assert!(!pat.could_match("//"));
        assert!(!pat.could_match("/ROOT/"));

        assert!(!pat.could_match("node_modules"));
        assert!(!pat.could_match("node_modules/package"));
        assert!(!pat.could_match("nested/node_modules"));
        assert!(!pat.could_match("nested/node_modules/package"));

        // forbidden match
        assert!(pat.could_match("file.map"));
        assert!(!pat.is_match("file.map"));
        assert!(pat.is_match("file.map/file.js"));
        assert!(!pat.is_match("file.d.ts"));
        assert!(!pat.is_match("file.d.ts.map"));
        assert!(!pat.is_match("file.d.ts.map"));
        assert!(!pat.is_match("dir/file.d.ts.map"));
        assert!(!pat.is_match("dir/inner/file.d.ts.map"));
        assert!(pat.could_match("dir/inner/file.d.ts.map"));
    }

    #[rstest]
    fn dynamic_match2() {
        let pat = Pattern::Concatenation(vec![
            Pattern::Dynamic,
            Pattern::Constant("/".into()),
            Pattern::Dynamic,
        ]);
        assert!(pat.could_match("dir"));
        assert!(pat.could_match("dir/"));
        assert!(pat.is_match("dir/index.js"));

        // forbidden:
        assert!(!pat.could_match("./"));
        assert!(!pat.is_match("./"));
        assert!(!pat.could_match("."));
        assert!(!pat.is_match("."));
        assert!(!pat.could_match("../"));
        assert!(!pat.is_match("../"));
        assert!(!pat.could_match(".."));
        assert!(!pat.is_match(".."));
        assert!(!pat.is_match("./../index.js"));
        assert!(!pat.is_match("././index.js"));
        assert!(!pat.is_match("./.git/index.js"));
        assert!(!pat.is_match("./inner/../index.js"));
        assert!(!pat.is_match("./inner/./index.js"));
        assert!(!pat.is_match("./inner/.git/index.js"));
        assert!(!pat.could_match("./../"));
        assert!(!pat.could_match("././"));
        assert!(!pat.could_match("./.git/"));
        assert!(!pat.could_match("./inner/../"));
        assert!(!pat.could_match("./inner/./"));
        assert!(!pat.could_match("./inner/.git/"));
        assert!(!pat.could_match("dir//"));
        assert!(!pat.could_match("dir//dir"));
        assert!(!pat.could_match("dir///dir"));
        assert!(!pat.could_match("/ROOT/"));

        assert!(!pat.could_match("node_modules"));
        assert!(!pat.could_match("node_modules/package"));
        assert!(!pat.could_match("nested/node_modules"));
        assert!(!pat.could_match("nested/node_modules/package"));

        // forbidden match
        assert!(pat.could_match("dir/file.map"));
        assert!(!pat.is_match("dir/file.map"));
        assert!(pat.is_match("file.map/file.js"));
        assert!(!pat.is_match("dir/file.d.ts"));
        assert!(!pat.is_match("dir/file.d.ts.map"));
        assert!(!pat.is_match("dir/file.d.ts.map"));
        assert!(!pat.is_match("dir/file.d.ts.map"));
        assert!(!pat.is_match("dir/inner/file.d.ts.map"));
        assert!(pat.could_match("dir/inner/file.d.ts.map"));
    }

    #[rstest]
    #[case::dynamic(Pattern::Dynamic)]
    #[case::dynamic_concat(Pattern::Concatenation(vec![Pattern::Dynamic, Pattern::Constant(".js".into())]))]
    #[case::dynamic_concat2(Pattern::Concatenation(vec![
        Pattern::Dynamic,
        Pattern::Constant("/".into()),
        Pattern::Dynamic,
    ]))]
    #[case::dynamic_alt_concat(Pattern::alternatives(vec![
        Pattern::Concatenation(vec![
            Pattern::Dynamic,
            Pattern::Constant("/".into()),
            Pattern::Dynamic,
        ]),
        Pattern::Dynamic,
    ]))]
    fn split_could_match(#[case] pat: Pattern) {
        let (abs, rel) = pat.split_could_match("/ROOT/");
        assert!(abs.is_none());
        assert!(rel.is_some());
    }

    #[rstest]
    #[case::dynamic(Pattern::Dynamic, "feijf", None)]
    #[case::dynamic_concat(
        Pattern::Concatenation(vec![Pattern::Dynamic, Pattern::Constant(".js".into())]),
        "hello.", None
    )]
    #[case::constant(Pattern::Constant("Hello World".into()), "Hello ", Some(vec![("World", true)]))]
    #[case::alternatives(
        Pattern::Alternatives(vec![
            Pattern::Constant("Hello World".into()),
            Pattern::Constant("Hello All".into())
        ]), "Hello ", Some(vec![("World", true), ("All", true)])
    )]
    #[case::alternatives_non_end(
        Pattern::Alternatives(vec![
            Pattern::Constant("Hello World".into()),
            Pattern::Constant("Hello All".into()),
            Pattern::Concatenation(vec![Pattern::Constant("Hello more".into()), Pattern::Dynamic])
        ]), "Hello ", Some(vec![("World", true), ("All", true), ("more", false)])
    )]
    #[case::request_with_extensions(
        Pattern::Alternatives(vec![
            Pattern::Constant("./file.js".into()),
            Pattern::Constant("./file.ts".into()),
            Pattern::Constant("./file.cjs".into()),
        ]), "./", Some(vec![("file.js", true), ("file.ts", true), ("file.cjs", true)])
    )]
    fn next_constants(
        #[case] pat: Pattern,
        #[case] value: &str,
        #[case] expected: Option<Vec<(&str, bool)>>,
    ) {
        assert_eq!(pat.next_constants(value), expected);
    }
}
