use std::{
    collections::{hash_map::Entry, VecDeque},
    fmt::Display,
    mem::take,
};

use anyhow::Result;
use lazy_static::lazy_static;
use regex::Regex;
use rustc_hash::{FxHashMap, FxHashSet};
use serde::{Deserialize, Serialize};
use tracing::Instrument;
use turbo_rcstr::RcStr;
use turbo_tasks::{
    debug::ValueDebugFormat, trace::TraceRawVcs, NonLocalValue, ResolvedVc, Value, ValueToString,
    Vc,
};
use turbo_tasks_fs::{
    util::normalize_path, FileSystemPath, LinkContent, LinkType, RawDirectoryContent,
    RawDirectoryEntry,
};

#[turbo_tasks::value(shared, serialization = "auto_for_input")]
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

fn longest_common_prefix<'a>(strings: &[&'a str]) -> &'a str {
    if strings.is_empty() {
        return "";
    }
    let first = strings[0];
    let mut len = first.len();
    for str in &strings[1..] {
        len = std::cmp::min(
            len,
            // TODO these are Unicode Scalar Values, not graphemes
            str.chars()
                .zip(first.chars())
                .take_while(|&(a, b)| a == b)
                .count(),
        );
    }
    &first[..len]
}

fn longest_common_suffix<'a>(strings: &[&'a str]) -> &'a str {
    if strings.is_empty() {
        return "";
    }
    let first = strings[0];
    let mut len = first.len();
    for str in &strings[1..] {
        len = std::cmp::min(
            len,
            // TODO these are Unicode Scalar Values, not graphemes
            str.chars()
                .rev()
                .zip(first.chars().rev())
                .take_while(|&(a, b)| a == b)
                .count(),
        );
    }
    &first[(first.len() - len)..]
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

    pub fn has_dynamic_parts(&self) -> bool {
        match self {
            Pattern::Constant(_) => false,
            Pattern::Dynamic => true,
            Pattern::Alternatives(list) | Pattern::Concatenation(list) => {
                list.iter().any(|p| p.has_dynamic_parts())
            }
        }
    }

    pub fn constant_prefix(&self) -> &str {
        // The normalized pattern is an Alternative of maximally merged
        // Concatenations, so extracting the first/only Concatenation child
        // elements is enough.

        fn collect_constant_prefix<'a: 'b, 'b>(pattern: &'a Pattern, result: &mut Vec<&'b str>) {
            match pattern {
                Pattern::Constant(c) => {
                    result.push(c.as_str());
                }
                Pattern::Concatenation(list) => {
                    if let Some(Pattern::Constant(first)) = list.first() {
                        result.push(first.as_str());
                    }
                }
                Pattern::Alternatives(_) => {
                    panic!("for constant_prefix a Pattern must be normalized");
                }
                Pattern::Dynamic => {}
            }
        }

        let mut strings: Vec<&str> = vec![];
        match self {
            c @ Pattern::Constant(_) | c @ Pattern::Concatenation(_) => {
                collect_constant_prefix(c, &mut strings);
            }
            Pattern::Alternatives(list) => {
                for c in list {
                    collect_constant_prefix(c, &mut strings);
                }
            }
            Pattern::Dynamic => {}
        }
        longest_common_prefix(&strings)
    }

    pub fn constant_suffix(&self) -> &str {
        // The normalized pattern is an Alternative of maximally merged
        // Concatenations, so extracting the first/only Concatenation child
        // elements is enough.

        fn collect_constant_suffix<'a: 'b, 'b>(pattern: &'a Pattern, result: &mut Vec<&'b str>) {
            match pattern {
                Pattern::Constant(c) => {
                    result.push(c.as_str());
                }
                Pattern::Concatenation(list) => {
                    if let Some(Pattern::Constant(first)) = list.last() {
                        result.push(first.as_str());
                    }
                }
                Pattern::Alternatives(_) => {
                    panic!("for constant_suffix a Pattern must be normalized");
                }
                Pattern::Dynamic => {}
            }
        }

        let mut strings: Vec<&str> = vec![];
        match self {
            c @ Pattern::Constant(_) | c @ Pattern::Concatenation(_) => {
                collect_constant_suffix(c, &mut strings);
            }
            Pattern::Alternatives(list) => {
                for c in list {
                    collect_constant_suffix(c, &mut strings);
                }
            }
            Pattern::Dynamic => {}
        }
        longest_common_suffix(&strings)
    }

    pub fn strip_prefix(&mut self, len: usize) {
        fn strip_prefix_internal(pattern: &mut Pattern, chars_to_strip: &mut usize) {
            match pattern {
                Pattern::Constant(c) => {
                    let c_len = c.len();
                    if *chars_to_strip >= c_len {
                        *c = "".into();
                    } else {
                        *c = (&c[*chars_to_strip..]).into();
                    }
                    *chars_to_strip = (*chars_to_strip).saturating_sub(c_len);
                }
                Pattern::Concatenation(list) => {
                    for c in list {
                        if *chars_to_strip > 0 {
                            strip_prefix_internal(c, chars_to_strip);
                        }
                    }
                }
                Pattern::Alternatives(_) => {
                    panic!("for strip_prefix a Pattern must be normalized");
                }
                Pattern::Dynamic => {
                    panic!("strip_prefix prefix is too long");
                }
            }
        }

        match &mut *self {
            c @ Pattern::Constant(_) | c @ Pattern::Concatenation(_) => {
                let mut len_local = len;
                strip_prefix_internal(c, &mut len_local);
            }
            Pattern::Alternatives(list) => {
                for c in list {
                    let mut len_local = len;
                    strip_prefix_internal(c, &mut len_local);
                }
            }
            Pattern::Dynamic => {
                if len > 0 {
                    panic!("strip_prefix prefix is too long");
                }
            }
        };

        self.normalize()
    }

    pub fn strip_suffix(&mut self, len: usize) {
        fn strip_suffix_internal(pattern: &mut Pattern, chars_to_strip: &mut usize) {
            match pattern {
                Pattern::Constant(c) => {
                    let c_len = c.len();
                    if *chars_to_strip >= c_len {
                        *c = "".into();
                    } else {
                        *c = (&c[..(c_len - *chars_to_strip)]).into();
                    }
                    *chars_to_strip = (*chars_to_strip).saturating_sub(c_len);
                }
                Pattern::Concatenation(list) => {
                    for c in list.iter_mut().rev() {
                        if *chars_to_strip > 0 {
                            strip_suffix_internal(c, chars_to_strip);
                        }
                    }
                }
                Pattern::Alternatives(_) => {
                    panic!("for strip_suffix a Pattern must be normalized");
                }
                Pattern::Dynamic => {
                    panic!("strip_suffix suffix is too long");
                }
            }
        }

        match &mut *self {
            c @ Pattern::Constant(_) | c @ Pattern::Concatenation(_) => {
                let mut len_local = len;
                strip_suffix_internal(c, &mut len_local);
            }
            Pattern::Alternatives(list) => {
                for c in list {
                    let mut len_local = len;
                    strip_suffix_internal(c, &mut len_local);
                }
            }
            Pattern::Dynamic => {
                if len > 0 {
                    panic!("strip_suffix suffix is too long");
                }
            }
        };

        self.normalize()
    }

    //// Replace all `*`s in `template` with self.
    ////
    //// Handle top-level alternatives separately so that multiple star placeholders
    //// match the same pattern instead of the whole alternative.
    pub fn spread_into_star(&self, template: &str) -> Pattern {
        if template.contains("*") {
            let alternatives: Box<dyn Iterator<Item = &Pattern>> = match self {
                Pattern::Alternatives(list) => Box::new(list.iter()),
                c => Box::new(std::iter::once(c)),
            };

            let mut result = Pattern::alternatives(alternatives.map(|pat| {
                let mut split = template.split("*");
                let mut concatenation: Vec<Pattern> = Vec::with_capacity(3);

                // There are at least two elements in the iterator
                concatenation.push(Pattern::Constant(split.next().unwrap().into()));

                for part in split {
                    concatenation.push(pat.clone());
                    if !part.is_empty() {
                        concatenation.push(Pattern::Constant(part.into()));
                    }
                }
                Pattern::Concatenation(concatenation)
            }));

            result.normalize();
            result
        } else {
            Pattern::Constant(template.into())
        }
    }

    /// Appends something to end the pattern.
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

    /// Appends something to end the pattern.
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

    /// Prepends something to front of the pattern.
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

    pub fn with_normalized_path(&self) -> Option<Pattern> {
        let mut new = self.clone();

        fn normalize_path_internal(pattern: &mut Pattern) -> Option<()> {
            match pattern {
                Pattern::Constant(c) => {
                    *c = (*(normalize_path(c)?)).into();
                    Some(())
                }
                Pattern::Dynamic => Some(()),
                Pattern::Concatenation(list) => {
                    let mut segments = Vec::new();
                    for seqment in list.iter() {
                        match seqment {
                            Pattern::Constant(str) => {
                                for seqment in str.split('/') {
                                    match seqment {
                                        "." | "" => {}
                                        ".." => {
                                            segments.pop()?;
                                        }
                                        seqment => {
                                            segments.push(vec![Pattern::Constant(seqment.into())]);
                                        }
                                    }
                                }
                                if str.ends_with("/") {
                                    segments.push(vec![]);
                                }
                            }
                            Pattern::Dynamic => {
                                if segments.is_empty() {
                                    segments.push(vec![]);
                                }
                                let last = segments.last_mut().unwrap();
                                last.push(Pattern::Dynamic);
                            }
                            Pattern::Alternatives(_) | Pattern::Concatenation(_) => {
                                panic!("for with_normalized_path the Pattern must be normalized");
                            }
                        }
                    }
                    let separator: RcStr = "/".into();
                    *list = segments
                        .into_iter()
                        .flat_map(|c| {
                            std::iter::once(Pattern::Constant(separator.clone())).chain(c)
                        })
                        .skip(1)
                        .collect();
                    Some(())
                }
                Pattern::Alternatives(_) => {
                    panic!("for with_normalized_path the Pattern must be normalized");
                }
            }
        }

        match &mut new {
            c @ Pattern::Constant(_) | c @ Pattern::Concatenation(_) => {
                normalize_path_internal(c)?;
            }
            Pattern::Alternatives(list) => {
                for c in list {
                    normalize_path_internal(c)?;
                }
            }
            Pattern::Dynamic => {}
        }

        new.normalize();
        Some(new)
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
                let mut has_dynamic = false;
                for alt in list.drain(..) {
                    if let Pattern::Alternatives(inner) = alt {
                        for alt in inner {
                            if alt == Pattern::Dynamic {
                                if !has_dynamic {
                                    has_dynamic = true;
                                    new_alternatives.push(alt);
                                }
                            } else {
                                new_alternatives.push(alt);
                            }
                        }
                    } else if alt == Pattern::Dynamic {
                        if !has_dynamic {
                            has_dynamic = true;
                            new_alternatives.push(alt);
                        }
                    } else {
                        new_alternatives.push(alt);
                    }
                }
                if new_alternatives.len() == 1 {
                    *self = new_alternatives.into_iter().next().unwrap();
                } else {
                    *list = new_alternatives;
                }
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

    /// Returns true if all matches of the pattern start with `value`.
    pub fn must_match(&self, value: &str) -> bool {
        if let Pattern::Alternatives(list) = self {
            list.iter()
                .all(|alt| alt.match_internal(value, None, false).could_match())
        } else {
            self.match_internal(value, None, false).could_match()
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

    /// Same as `match_internal`, but additionally pushing matched dynamic elements into the given
    /// result list.
    fn match_collect_internal<'a>(
        &self,
        mut value: &'a str,
        mut any_offset: Option<usize>,
        dynamics: &mut VecDeque<&'a str>,
    ) -> MatchResult<'a> {
        match self {
            Pattern::Constant(c) => {
                if let Some(offset) = any_offset {
                    if let Some(index) = value.find(&**c) {
                        if index <= offset {
                            if index > 0 {
                                dynamics.push_back(&value[..index]);
                            }
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
                    match part.match_collect_internal(value, any_offset, dynamics) {
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
                if let Some(offset) = any_offset {
                    if offset == value.len() {
                        dynamics.push_back(value);
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

    /// Calls `cb` on all constants that are at the end of the pattern and
    /// replaces the given final constant with the returned pattern. Returns
    /// true if replacements were performed.
    pub fn replace_final_constants(&mut self, cb: &impl Fn(&RcStr) -> Option<Pattern>) -> bool {
        let mut replaced = false;
        match self {
            Pattern::Constant(c) => {
                if let Some(replacement) = cb(c) {
                    *self = replacement;
                    replaced = true;
                }
            }
            Pattern::Dynamic => {}
            Pattern::Alternatives(list) => {
                for i in list {
                    replaced = i.replace_final_constants(cb) || replaced;
                }
            }
            Pattern::Concatenation(list) => {
                if let Some(i) = list.last_mut() {
                    replaced = i.replace_final_constants(cb) || replaced;
                }
            }
        }
        replaced
    }

    /// Matches the given string against self, and applies the match onto the target pattern.
    ///
    /// The two patterns should have a similar structure (same number of alternatives and dynamics)
    /// and only differ in the constant contents.
    pub fn match_apply_template(&self, value: &str, target: &Pattern) -> Option<String> {
        let match_idx = self.match_position(value)?;
        let source = match self {
            Pattern::Alternatives(list) => list.get(match_idx),
            Pattern::Constant(_) | Pattern::Dynamic | Pattern::Concatenation(_)
                if match_idx == 0 =>
            {
                Some(self)
            }
            _ => None,
        }?;
        let target = match target {
            Pattern::Alternatives(list) => list.get(match_idx),
            Pattern::Constant(_) | Pattern::Dynamic | Pattern::Concatenation(_)
                if match_idx == 0 =>
            {
                Some(target)
            }
            _ => None,
        }?;

        let mut dynamics = VecDeque::new();
        // This is definitely a match, because it matched above in `self.match_position(value)`
        source.match_collect_internal(value, None, &mut dynamics);

        let mut result = "".to_string();
        match target {
            Pattern::Constant(c) => result.push_str(c),
            Pattern::Dynamic => result.push_str(dynamics.pop_front()?),
            Pattern::Concatenation(list) => {
                for c in list {
                    match c {
                        Pattern::Constant(c) => result.push_str(c),
                        Pattern::Dynamic => result.push_str(dynamics.pop_front()?),
                        Pattern::Alternatives(_) | Pattern::Concatenation(_) => {
                            panic!("Pattern must be normalized")
                        }
                    }
                }
            }
            Pattern::Alternatives(_) => panic!("Pattern must be normalized"),
        }
        if !dynamics.is_empty() {
            return None;
        }

        Some(result)
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

#[derive(PartialEq, Debug)]
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

impl MatchResult<'_> {
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

#[derive(PartialEq, Debug)]
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
            Pattern::Constant(c) => write!(f, "'{c}'"),
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

#[derive(
    Debug,
    PartialEq,
    Eq,
    Clone,
    TraceRawVcs,
    Serialize,
    Deserialize,
    ValueDebugFormat,
    NonLocalValue,
)]
pub enum PatternMatch {
    File(RcStr, ResolvedVc<FileSystemPath>),
    Directory(RcStr, ResolvedVc<FileSystemPath>),
}

impl PatternMatch {
    pub fn path(&self) -> ResolvedVc<FileSystemPath> {
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
    lookup_dir: ResolvedVc<FileSystemPath>,
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
            let mut handled = FxHashSet::default();
            let mut read_dir_results = FxHashMap::default();
            for (index, (str, until_end)) in constants.into_iter().enumerate() {
                if until_end {
                    if !handled.insert(str) {
                        continue;
                    }
                    let (parent_path, last_segment) = split_last_segment(str);
                    if last_segment.is_empty() {
                        // This means we don't have a last segment, so we just have a directory
                        let joined = if force_in_lookup_dir {
                            lookup_dir.try_join_inside(parent_path.into()).await?
                        } else {
                            lookup_dir.try_join(parent_path.into()).await?
                        };
                        let Some(fs_path) = *joined else {
                            continue;
                        };
                        results.push((
                            index,
                            PatternMatch::Directory(concat(&prefix, str).into(), fs_path),
                        ));
                        continue;
                    }
                    let entry = read_dir_results.entry(parent_path);
                    let read_dir = match entry {
                        Entry::Occupied(e) => Some(e.into_mut()),
                        Entry::Vacant(e) => {
                            let path_option = *if force_in_lookup_dir {
                                lookup_dir.try_join_inside(parent_path.into()).await?
                            } else {
                                lookup_dir.try_join(parent_path.into()).await?
                            };
                            if let Some(path) = path_option {
                                Some(e.insert((path.raw_read_dir().await?, path)))
                            } else {
                                None
                            }
                        }
                    };
                    let Some((read_dir, parent_fs_path)) = read_dir else {
                        continue;
                    };
                    let RawDirectoryContent::Entries(entries) = &**read_dir else {
                        continue;
                    };
                    let Some(entry) = entries.get(last_segment) else {
                        continue;
                    };
                    match *entry {
                        RawDirectoryEntry::File => {
                            results.push((
                                index,
                                PatternMatch::File(
                                    concat(&prefix, str).into(),
                                    parent_fs_path
                                        .join(last_segment.into())
                                        .to_resolved()
                                        .await?,
                                ),
                            ));
                        }
                        RawDirectoryEntry::Directory => results.push((
                            index,
                            PatternMatch::Directory(
                                concat(&prefix, str).into(),
                                parent_fs_path
                                    .join(last_segment.into())
                                    .to_resolved()
                                    .await?,
                            ),
                        )),
                        RawDirectoryEntry::Symlink => {
                            let fs_path = parent_fs_path
                                .join(last_segment.into())
                                .to_resolved()
                                .await?;
                            let LinkContent::Link { link_type, .. } = &*fs_path.read_link().await?
                            else {
                                continue;
                            };
                            let path = concat(&prefix, str).into();
                            if link_type.contains(LinkType::DIRECTORY) {
                                results.push((index, PatternMatch::Directory(path, fs_path)));
                            } else {
                                results.push((index, PatternMatch::File(path, fs_path)))
                            }
                        }
                        _ => {}
                    }
                } else {
                    let subpath = &str[..=str.rfind('/').unwrap()];
                    if handled.insert(subpath) {
                        let joined = if force_in_lookup_dir {
                            lookup_dir.try_join_inside(subpath.into()).await?
                        } else {
                            lookup_dir.try_join(subpath.into()).await?
                        };
                        let Some(fs_path) = *joined else {
                            continue;
                        };
                        nested.push((
                            0,
                            read_matches(
                                *fs_path,
                                concat(&prefix, subpath).into(),
                                force_in_lookup_dir,
                                pattern,
                            ),
                        ));
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
                        PatternMatch::Directory(
                            prefix.clone().into(),
                            lookup_dir.parent().to_resolved().await?,
                        ),
                    ));
                }

                // {prefix}../
                prefix.push('/');
                if let Some(pos) = pat.match_position(&prefix) {
                    results.push((
                        pos,
                        PatternMatch::Directory(
                            prefix.clone().into(),
                            lookup_dir.parent().to_resolved().await?,
                        ),
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
                    nested.push((pos, read_matches(*lookup_dir, "./".into(), false, pattern)));
                }
            } else {
                prefix.push('/');
                // {prefix}/
                if let Some(pos) = pat.could_match_position(&prefix) {
                    nested.push((
                        pos,
                        read_matches(*lookup_dir, prefix.to_string().into(), false, pattern),
                    ));
                }
                prefix.pop();
                prefix.push_str("./");
                // {prefix}./
                if let Some(pos) = pat.could_match_position(&prefix) {
                    nested.push((
                        pos,
                        read_matches(*lookup_dir, prefix.to_string().into(), false, pattern),
                    ));
                }
                prefix.pop();
                prefix.pop();
            }
            match &*lookup_dir.raw_read_dir().await? {
                RawDirectoryContent::Entries(map) => {
                    for (key, entry) in map.iter() {
                        match entry {
                            RawDirectoryEntry::File => {
                                let len = prefix.len();
                                prefix.push_str(key);
                                // {prefix}{key}
                                if let Some(pos) = pat.match_position(&prefix) {
                                    let path = lookup_dir.join(key.clone()).to_resolved().await?;
                                    results.push((
                                        pos,
                                        PatternMatch::File(prefix.clone().into(), path),
                                    ));
                                }
                                prefix.truncate(len)
                            }
                            RawDirectoryEntry::Directory => {
                                let len = prefix.len();
                                prefix.push_str(key);
                                // {prefix}{key}
                                if prefix.ends_with('/') {
                                    prefix.pop();
                                }
                                if let Some(pos) = pat.match_position(&prefix) {
                                    let path = lookup_dir.join(key.clone()).to_resolved().await?;
                                    results.push((
                                        pos,
                                        PatternMatch::Directory(prefix.clone().into(), path),
                                    ));
                                }
                                prefix.push('/');
                                // {prefix}{key}/
                                if let Some(pos) = pat.match_position(&prefix) {
                                    let path = lookup_dir.join(key.clone()).to_resolved().await?;
                                    results.push((
                                        pos,
                                        PatternMatch::Directory(prefix.clone().into(), path),
                                    ));
                                }
                                if let Some(pos) = pat.could_match_position(&prefix) {
                                    let path = lookup_dir.join(key.clone()).to_resolved().await?;
                                    nested.push((
                                        pos,
                                        read_matches(*path, prefix.clone().into(), true, pattern),
                                    ));
                                }
                                prefix.truncate(len)
                            }
                            RawDirectoryEntry::Symlink => {
                                let len = prefix.len();
                                prefix.push_str(key);
                                // {prefix}{key}
                                if prefix.ends_with('/') {
                                    prefix.pop();
                                }
                                if let Some(pos) = pat.match_position(&prefix) {
                                    let fs_path =
                                        lookup_dir.join(key.clone()).to_resolved().await?;
                                    if let LinkContent::Link { link_type, .. } =
                                        &*fs_path.read_link().await?
                                    {
                                        if link_type.contains(LinkType::DIRECTORY) {
                                            results.push((
                                                pos,
                                                PatternMatch::Directory(
                                                    prefix.clone().into(),
                                                    fs_path,
                                                ),
                                            ));
                                        } else {
                                            results.push((
                                                pos,
                                                PatternMatch::File(prefix.clone().into(), fs_path),
                                            ));
                                        }
                                    }
                                }
                                prefix.push('/');
                                if let Some(pos) = pat.match_position(&prefix) {
                                    let fs_path =
                                        lookup_dir.join(key.clone()).to_resolved().await?;
                                    if let LinkContent::Link { link_type, .. } =
                                        &*fs_path.read_link().await?
                                    {
                                        if link_type.contains(LinkType::DIRECTORY) {
                                            results.push((
                                                pos,
                                                PatternMatch::Directory(
                                                    prefix.clone().into(),
                                                    fs_path,
                                                ),
                                            ));
                                        }
                                    }
                                }
                                if let Some(pos) = pat.could_match_position(&prefix) {
                                    let fs_path =
                                        lookup_dir.join(key.clone()).to_resolved().await?;
                                    if let LinkContent::Link { link_type, .. } =
                                        &*fs_path.read_link().await?
                                    {
                                        if link_type.contains(LinkType::DIRECTORY) {
                                            results.push((
                                                pos,
                                                PatternMatch::Directory(
                                                    prefix.clone().into(),
                                                    fs_path,
                                                ),
                                            ));
                                        }
                                    }
                                }
                                prefix.truncate(len)
                            }
                            RawDirectoryEntry::Other => {}
                            RawDirectoryEntry::Error => {}
                        }
                    }
                }
                RawDirectoryContent::NotFound => {}
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

fn concat(a: &str, b: &str) -> String {
    let mut result = String::with_capacity(a.len() + b.len());
    result.push_str(a);
    result.push_str(b);
    result
}

/// Returns the parent folder and the last segment of the path. When the last segment is unknown (e.
/// g. when using `../`) it returns the full path and an empty string.
fn split_last_segment(path: &str) -> (&str, &str) {
    if let Some((remaining_path, last_segment)) = path.rsplit_once('/') {
        match last_segment {
            "" => split_last_segment(remaining_path),
            "." => split_last_segment(remaining_path),
            ".." => match split_last_segment(remaining_path) {
                (_, "") => (path, ""),
                (parent_path, _) => split_last_segment(parent_path),
            },
            _ => (remaining_path, last_segment),
        }
    } else {
        match path {
            "" => ("", ""),
            "." => ("", ""),
            ".." => ("..", ""),
            _ => ("", path),
        }
    }
}

#[cfg(test)]
mod tests {
    use rstest::*;
    use turbo_rcstr::RcStr;

    use super::{longest_common_prefix, longest_common_suffix, split_last_segment, Pattern};

    #[test]
    fn longest_common_prefix_test() {
        assert_eq!(longest_common_prefix(&["ab"]), "ab");
        assert_eq!(longest_common_prefix(&["ab", "cd", "ef"]), "");
        assert_eq!(longest_common_prefix(&["ab1", "ab23", "ab456"]), "ab");
        assert_eq!(longest_common_prefix(&["abc", "abc", "abc"]), "abc");
        assert_eq!(longest_common_prefix(&["abc", "a", "abc"]), "a");
    }

    #[test]
    fn longest_common_suffix_test() {
        assert_eq!(longest_common_suffix(&["ab"]), "ab");
        assert_eq!(longest_common_suffix(&["ab", "cd", "ef"]), "");
        assert_eq!(longest_common_suffix(&["1ab", "23ab", "456ab"]), "ab");
        assert_eq!(longest_common_suffix(&["abc", "abc", "abc"]), "abc");
        assert_eq!(longest_common_suffix(&["abc", "c", "abc"]), "c");
    }

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

        #[allow(clippy::redundant_clone)] // alignment
        {
            let mut p = Pattern::Alternatives(vec![a.clone()]);
            p.normalize();

            assert_eq!(p, a);
        }

        #[allow(clippy::redundant_clone)] // alignment
        {
            let mut p = Pattern::Alternatives(vec![Pattern::Dynamic, Pattern::Dynamic]);
            p.normalize();

            assert_eq!(p, Pattern::Dynamic);
        }
    }

    #[test]
    fn with_normalized_path() {
        assert!(Pattern::Constant("a/../..".into())
            .with_normalized_path()
            .is_none());
        assert_eq!(
            Pattern::Constant("a/b/../c".into())
                .with_normalized_path()
                .unwrap(),
            Pattern::Constant("a/c".into())
        );
        assert_eq!(
            Pattern::Alternatives(vec![
                Pattern::Constant("a/b/../c".into()),
                Pattern::Constant("a/b/../c/d".into())
            ])
            .with_normalized_path()
            .unwrap(),
            Pattern::Alternatives(vec![
                Pattern::Constant("a/c".into()),
                Pattern::Constant("a/c/d".into())
            ])
        );

        // Dynamic is a segment itself
        assert_eq!(
            Pattern::Concatenation(vec![
                Pattern::Constant("a/b/".into()),
                Pattern::Dynamic,
                Pattern::Constant("../c".into())
            ])
            .with_normalized_path()
            .unwrap(),
            Pattern::Constant("a/b/c".into())
        );

        // Dynamic is only part of the second segment
        assert_eq!(
            Pattern::Concatenation(vec![
                Pattern::Constant("a/b".into()),
                Pattern::Dynamic,
                Pattern::Constant("../c".into())
            ])
            .with_normalized_path()
            .unwrap(),
            Pattern::Constant("a/c".into())
        );
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

    #[test]
    fn constant_prefix() {
        assert_eq!(
            Pattern::Constant("a/b/c.js".into()).constant_prefix(),
            "a/b/c.js",
        );

        let pat = Pattern::Alternatives(vec![
            Pattern::Constant("a/b/x".into()),
            Pattern::Constant("a/b/y".into()),
            Pattern::Concatenation(vec![Pattern::Constant("a/b/c/".into()), Pattern::Dynamic]),
        ]);
        assert_eq!(pat.constant_prefix(), "a/b/");
    }

    #[test]
    fn constant_suffix() {
        assert_eq!(
            Pattern::Constant("a/b/c.js".into()).constant_suffix(),
            "a/b/c.js",
        );

        let pat = Pattern::Alternatives(vec![
            Pattern::Constant("a/b/x.js".into()),
            Pattern::Constant("a/b/y.js".into()),
            Pattern::Concatenation(vec![
                Pattern::Constant("a/b/c/".into()),
                Pattern::Dynamic,
                Pattern::Constant(".js".into()),
            ]),
        ]);
        assert_eq!(pat.constant_suffix(), ".js");
    }

    #[test]
    fn strip_prefix() {
        fn strip(mut pat: Pattern, n: usize) -> Pattern {
            pat.strip_prefix(n);
            pat
        }

        assert_eq!(
            strip(Pattern::Constant("a/b".into()), 0),
            Pattern::Constant("a/b".into())
        );

        assert_eq!(
            strip(
                Pattern::Alternatives(vec![
                    Pattern::Constant("a/b/x".into()),
                    Pattern::Constant("a/b/y".into()),
                ]),
                2
            ),
            Pattern::Alternatives(vec![
                Pattern::Constant("b/x".into()),
                Pattern::Constant("b/y".into()),
            ])
        );

        assert_eq!(
            strip(
                Pattern::Concatenation(vec![
                    Pattern::Constant("a/".into()),
                    Pattern::Constant("b".into()),
                    Pattern::Constant("/".into()),
                    Pattern::Constant("y/".into()),
                    Pattern::Dynamic
                ]),
                4
            ),
            Pattern::Concatenation(vec![Pattern::Constant("y/".into()), Pattern::Dynamic]),
        );
    }

    #[test]
    fn strip_suffix() {
        fn strip(mut pat: Pattern, n: usize) -> Pattern {
            pat.strip_suffix(n);
            pat
        }

        assert_eq!(
            strip(Pattern::Constant("a/b".into()), 0),
            Pattern::Constant("a/b".into())
        );

        assert_eq!(
            strip(
                Pattern::Alternatives(vec![
                    Pattern::Constant("x/b/a".into()),
                    Pattern::Constant("y/b/a".into()),
                ]),
                2
            ),
            Pattern::Alternatives(vec![
                Pattern::Constant("x/b".into()),
                Pattern::Constant("y/b".into()),
            ])
        );

        assert_eq!(
            strip(
                Pattern::Concatenation(vec![
                    Pattern::Dynamic,
                    Pattern::Constant("/a/".into()),
                    Pattern::Constant("b".into()),
                    Pattern::Constant("/".into()),
                    Pattern::Constant("y/".into()),
                ]),
                4
            ),
            Pattern::Concatenation(vec![Pattern::Dynamic, Pattern::Constant("/a/".into()),]),
        );
    }

    #[test]
    fn spread_into_star() {
        let pat = Pattern::Constant("xyz".into());
        assert_eq!(
            pat.spread_into_star("before/after"),
            Pattern::Constant("before/after".into()),
        );

        let pat =
            Pattern::Concatenation(vec![Pattern::Constant("a/b/c/".into()), Pattern::Dynamic]);
        assert_eq!(
            pat.spread_into_star("before/*/after"),
            Pattern::Concatenation(vec![
                Pattern::Constant("before/a/b/c/".into()),
                Pattern::Dynamic,
                Pattern::Constant("/after".into())
            ])
        );

        let pat = Pattern::Alternatives(vec![
            Pattern::Concatenation(vec![Pattern::Constant("a/".into()), Pattern::Dynamic]),
            Pattern::Concatenation(vec![Pattern::Constant("b/".into()), Pattern::Dynamic]),
        ]);
        assert_eq!(
            pat.spread_into_star("before/*/after"),
            Pattern::Alternatives(vec![
                Pattern::Concatenation(vec![
                    Pattern::Constant("before/a/".into()),
                    Pattern::Dynamic,
                    Pattern::Constant("/after".into())
                ]),
                Pattern::Concatenation(vec![
                    Pattern::Constant("before/b/".into()),
                    Pattern::Dynamic,
                    Pattern::Constant("/after".into())
                ]),
            ])
        );

        let pat = Pattern::Alternatives(vec![
            Pattern::Constant("a".into()),
            Pattern::Constant("b".into()),
        ]);
        assert_eq!(
            pat.spread_into_star("before/*/*"),
            Pattern::Alternatives(vec![
                Pattern::Constant("before/a/a".into()),
                Pattern::Constant("before/b/b".into()),
            ])
        );

        let pat = Pattern::Dynamic;
        assert_eq!(
            pat.spread_into_star("before/*/*"),
            Pattern::Concatenation(vec![
                // TODO currently nothing ensures that both Dynamic parts are equal
                Pattern::Constant("before/".into()),
                Pattern::Dynamic,
                Pattern::Constant("/".into()),
                Pattern::Dynamic
            ])
        );
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

    #[test]
    fn replace_final_constants() {
        fn f(mut p: Pattern, cb: &impl Fn(&RcStr) -> Option<Pattern>) -> Pattern {
            p.replace_final_constants(cb);
            p
        }

        let js_to_ts_tsx = |c: &RcStr| -> Option<Pattern> {
            c.strip_suffix(".js").map(|rest| {
                let new_ending = Pattern::Alternatives(vec![
                    Pattern::Constant(".ts".into()),
                    Pattern::Constant(".tsx".into()),
                    Pattern::Constant(".js".into()),
                ]);
                if !rest.is_empty() {
                    Pattern::Concatenation(vec![Pattern::Constant(rest.into()), new_ending])
                } else {
                    new_ending
                }
            })
        };

        assert_eq!(
            f(
                Pattern::Concatenation(vec![
                    Pattern::Constant(".".into()),
                    Pattern::Constant("/".into()),
                    Pattern::Dynamic,
                    Pattern::Alternatives(vec![
                        Pattern::Constant(".js".into()),
                        Pattern::Constant(".node".into()),
                    ])
                ]),
                &js_to_ts_tsx
            ),
            Pattern::Concatenation(vec![
                Pattern::Constant(".".into()),
                Pattern::Constant("/".into()),
                Pattern::Dynamic,
                Pattern::Alternatives(vec![
                    Pattern::Alternatives(vec![
                        Pattern::Constant(".ts".into()),
                        Pattern::Constant(".tsx".into()),
                        Pattern::Constant(".js".into()),
                    ]),
                    Pattern::Constant(".node".into()),
                ])
            ]),
        );
        assert_eq!(
            f(
                Pattern::Concatenation(vec![
                    Pattern::Constant(".".into()),
                    Pattern::Constant("/".into()),
                    Pattern::Constant("abc.js".into()),
                ]),
                &js_to_ts_tsx
            ),
            Pattern::Concatenation(vec![
                Pattern::Constant(".".into()),
                Pattern::Constant("/".into()),
                Pattern::Concatenation(vec![
                    Pattern::Constant("abc".into()),
                    Pattern::Alternatives(vec![
                        Pattern::Constant(".ts".into()),
                        Pattern::Constant(".tsx".into()),
                        Pattern::Constant(".js".into()),
                    ])
                ]),
            ])
        );
    }

    #[test]
    fn match_apply_template() {
        assert_eq!(
            Pattern::Concatenation(vec![
                Pattern::Constant("a/b/".into()),
                Pattern::Dynamic,
                Pattern::Constant(".ts".into()),
            ])
            .match_apply_template(
                "a/b/foo.ts",
                &Pattern::Concatenation(vec![
                    Pattern::Constant("@/a/b/".into()),
                    Pattern::Dynamic,
                    Pattern::Constant(".js".into()),
                ])
            )
            .as_deref(),
            Some("@/a/b/foo.js")
        );
        assert_eq!(
            Pattern::Concatenation(vec![
                Pattern::Constant("b/".into()),
                Pattern::Dynamic,
                Pattern::Constant(".ts".into()),
            ])
            .match_apply_template(
                "a/b/foo.ts",
                &Pattern::Concatenation(vec![
                    Pattern::Constant("@/a/b/".into()),
                    Pattern::Dynamic,
                    Pattern::Constant(".js".into()),
                ])
            )
            .as_deref(),
            None,
        );
        assert_eq!(
            Pattern::Concatenation(vec![
                Pattern::Constant("a/b/".into()),
                Pattern::Dynamic,
                Pattern::Constant(".ts".into()),
            ])
            .match_apply_template(
                "a/b/foo.ts",
                &Pattern::Concatenation(vec![
                    Pattern::Constant("@/a/b/x".into()),
                    Pattern::Constant(".js".into()),
                ])
            )
            .as_deref(),
            None,
        );
        assert_eq!(
            Pattern::Concatenation(vec![Pattern::Constant("./sub/".into()), Pattern::Dynamic])
                .match_apply_template(
                    "./sub/file1",
                    &Pattern::Concatenation(vec![
                        Pattern::Constant("@/sub/".into()),
                        Pattern::Dynamic
                    ])
                )
                .as_deref(),
            Some("@/sub/file1"),
        );
    }

    #[test]
    fn test_split_last_segment() {
        assert_eq!(split_last_segment(""), ("", ""));
        assert_eq!(split_last_segment("a"), ("", "a"));
        assert_eq!(split_last_segment("a/"), ("", "a"));
        assert_eq!(split_last_segment("a/b"), ("a", "b"));
        assert_eq!(split_last_segment("a/b/"), ("a", "b"));
        assert_eq!(split_last_segment("a/b/c"), ("a/b", "c"));
        assert_eq!(split_last_segment("a/b/."), ("a", "b"));
        assert_eq!(split_last_segment("a/b/.."), ("", "a"));
        assert_eq!(split_last_segment("a/b/c/.."), ("a", "b"));
        assert_eq!(split_last_segment("a/b/c/../.."), ("", "a"));
        assert_eq!(split_last_segment("a/b/c/d/../.."), ("a", "b"));
        assert_eq!(split_last_segment("a/b/c/../d/.."), ("a", "b"));
        assert_eq!(split_last_segment("a/b/../c/d/.."), ("a/b/..", "c"));
        assert_eq!(split_last_segment("."), ("", ""));
        assert_eq!(split_last_segment("./"), ("", ""));
        assert_eq!(split_last_segment(".."), ("..", ""));
        assert_eq!(split_last_segment("../"), ("..", ""));
        assert_eq!(split_last_segment("./../"), ("./..", ""));
        assert_eq!(split_last_segment("../../"), ("../..", ""));
        assert_eq!(split_last_segment("../../."), ("../..", ""));
        assert_eq!(split_last_segment("../.././"), ("../..", ""));
        assert_eq!(split_last_segment("a/.."), ("", ""));
        assert_eq!(split_last_segment("a/../"), ("", ""));
        assert_eq!(split_last_segment("a/../.."), ("a/../..", ""));
        assert_eq!(split_last_segment("a/../../"), ("a/../..", ""));
        assert_eq!(split_last_segment("a/././../"), ("", ""));
        assert_eq!(split_last_segment("../a"), ("..", "a"));
        assert_eq!(split_last_segment("../a/"), ("..", "a"));
        assert_eq!(split_last_segment("../../a"), ("../..", "a"));
        assert_eq!(split_last_segment("../../a/"), ("../..", "a"));
    }
}
