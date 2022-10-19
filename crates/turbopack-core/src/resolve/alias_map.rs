use std::{
    borrow::Cow,
    collections::BTreeMap,
    fmt::{Debug, Formatter},
    future::Future,
};

use patricia_tree::PatriciaMap;
use serde::{
    de::{MapAccess, Visitor},
    ser::SerializeMap,
    Deserialize, Deserializer, Serialize, Serializer,
};
use turbo_tasks::trace::{TraceRawVcs, TraceRawVcsContext};

/// A map of [`AliasPattern`]s to the [`Template`]s they resolve to.
///
/// If a pattern has a wildcard character (*) within it, it will capture any
/// number of characters, including path separators. The result of the capture
/// will then be passed to the template.
///
/// If the pattern does not have a wildcard character, it will only match the
/// exact string, and return the template as-is.
#[derive(Clone)]
pub struct AliasMap<T> {
    map: PatriciaMap<BTreeMap<AliasKey, T>>,
}

impl<T> Default for AliasMap<T> {
    fn default() -> Self {
        Self::new()
    }
}

impl<T> PartialEq for AliasMap<T>
where
    T: PartialEq,
{
    fn eq(&self, other: &Self) -> bool {
        if self.map.len() != other.map.len() {
            return false;
        }

        self.map.iter().zip(other.map.iter()).all(|(a, b)| a == b)
    }
}

impl<T> Eq for AliasMap<T> where T: Eq {}

impl<T> Serialize for AliasMap<T>
where
    T: Serialize,
{
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut map = serializer.serialize_map(Some(self.map.len()))?;
        for (key, value) in self.map.iter() {
            map.serialize_entry(&key, value)?;
        }
        map.end()
    }
}

struct AliasMapVisitor<T> {
    marker: std::marker::PhantomData<T>,
}

impl<'de, T> Visitor<'de> for AliasMapVisitor<T>
where
    T: Deserialize<'de>,
{
    type Value = AliasMap<T>;

    fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
        formatter.write_str("a map of alias patterns to templates")
    }

    fn visit_map<M>(self, mut access: M) -> Result<Self::Value, M::Error>
    where
        M: MapAccess<'de>,
    {
        let mut map = AliasMap::new();
        while let Some((key, value)) = access.next_entry()? {
            map.insert(key, value);
        }
        Ok(map)
    }
}

impl<'a, T> Deserialize<'a> for AliasMap<T>
where
    T: Deserialize<'a>,
{
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'a>,
    {
        deserializer.deserialize_map(AliasMapVisitor {
            marker: std::marker::PhantomData,
        })
    }
}

impl<T> TraceRawVcs for AliasMap<T>
where
    T: TraceRawVcs,
{
    fn trace_raw_vcs(&self, context: &mut TraceRawVcsContext) {
        for (_, map) in self.map.iter() {
            for value in map.values() {
                value.trace_raw_vcs(context);
            }
        }
    }
}

impl<T> Debug for AliasMap<T>
where
    T: Debug,
{
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        f.debug_map()
            .entries(self.map.iter().flat_map(|(key, map)| {
                let key = String::from_utf8(key).expect("invalid UTF-8 key in AliasMap");
                map.iter().map(move |(alias_key, value)| match alias_key {
                    AliasKey::Exact => (key.clone(), value),
                    AliasKey::Wildcard { suffix } => (format!("{}*{}", key, suffix), value),
                })
            }))
            .finish()
    }
}

impl<T> AliasMap<T> {
    /// Creates a new alias map.
    pub fn new() -> Self {
        AliasMap {
            map: PatriciaMap::new(),
        }
    }

    /// Looks up a request in the alias map.
    ///
    /// Returns an iterator to all the matching aliases.
    pub fn lookup<'a>(&'a self, request: &'a str) -> AliasMapLookupIterator<'a, T>
    where
        T: Debug,
    {
        // Invariant: prefixes should be sorted by increasing length (base lengths),
        // according to PATTERN_KEY_COMPARE. Since we're using a prefix tree, this is
        // the default behavior of the common prefix iterator.
        let mut prefixes_stack = self
            .map
            .common_prefixes(request.as_bytes())
            .collect::<Vec<_>>();
        AliasMapLookupIterator {
            request,
            current_prefix_iterator: prefixes_stack
                .pop()
                .map(|(prefix, map)| (prefix, map.iter())),
            prefixes_stack,
        }
    }

    /// Inserts a new alias into the map.
    ///
    /// If the map did not have this alias already, `None` is returned.
    ///
    /// If the map had this alias, the template is updated, and the old template
    /// is returned.
    pub fn insert(&mut self, pattern: AliasPattern, template: T) -> Option<T> {
        let (prefix_key, alias_key, value) = match pattern {
            AliasPattern::Exact(exact) => (exact, AliasKey::Exact, template),
            AliasPattern::Wildcard { prefix, suffix } => {
                (prefix, AliasKey::Wildcard { suffix }, template)
            }
        };
        // NOTE(alexkirsz) patricia_tree doesn't implement std's `Entry` API,
        // where we could do:
        // self.trie
        //     .entry(key.into())
        //     .or_insert_with(BTreeSet::new)
        //     .insert(value)
        if let Some(map) = self.map.get_mut(&prefix_key) {
            map.insert(alias_key, value)
        } else {
            let mut map = BTreeMap::new();
            map.insert(alias_key, value);
            self.map.insert(prefix_key, map);
            None
        }
    }
}

impl<T> IntoIterator for AliasMap<T> {
    type Item = (AliasPattern, T);

    type IntoIter = AliasMapIntoIter<T>;

    fn into_iter(self) -> Self::IntoIter {
        AliasMapIntoIter {
            iter: self.map.into_iter(),
            current_prefix_iterator: None,
        }
    }
}

/// An owning iterator over the entries of an `AliasMap`.
///
/// Beware: The items are *NOT* returned in the order defined by
/// [PATTERN_KEY_COMPARE].
///
/// [PATTERN_KEY_COMPARE]: https://nodejs.org/api/esm.html#resolver-algorithm-specification
pub struct AliasMapIntoIter<T> {
    iter: patricia_tree::map::IntoIter<BTreeMap<AliasKey, T>>,
    current_prefix_iterator: Option<AliasMapIntoIterItem<T>>,
}

struct AliasMapIntoIterItem<T> {
    prefix: String,
    iterator: std::collections::btree_map::IntoIter<AliasKey, T>,
}

impl<T> AliasMapIntoIter<T> {
    fn advance_iter(&mut self) -> Option<&mut AliasMapIntoIterItem<T>> {
        let (prefix, map) = self.iter.next()?;
        let prefix = String::from_utf8(prefix).expect("invalid UTF-8 key in AliasMap");
        self.current_prefix_iterator = Some(AliasMapIntoIterItem {
            prefix,
            iterator: map.into_iter(),
        });
        self.current_prefix_iterator.as_mut()
    }
}

impl<T> Iterator for AliasMapIntoIter<T> {
    type Item = (AliasPattern, T);

    fn next(&mut self) -> Option<Self::Item> {
        let mut current_prefix_iterator = match self.current_prefix_iterator {
            None => self.advance_iter()?,
            Some(ref mut current_prefix_iterator) => current_prefix_iterator,
        };
        let mut current_value = current_prefix_iterator.iterator.next();
        loop {
            match current_value {
                None => {
                    current_prefix_iterator = self.advance_iter()?;
                    current_value = current_prefix_iterator.iterator.next();
                }
                Some(current_value) => {
                    return Some(match current_value {
                        (AliasKey::Exact, value) => (
                            AliasPattern::Exact(current_prefix_iterator.prefix.clone()),
                            value,
                        ),
                        (AliasKey::Wildcard { suffix }, value) => (
                            AliasPattern::Wildcard {
                                prefix: current_prefix_iterator.prefix.clone(),
                                suffix,
                            },
                            value,
                        ),
                    });
                }
            }
        }
    }
}

impl<T> Extend<(AliasPattern, T)> for AliasMap<T> {
    fn extend<It>(&mut self, iter: It)
    where
        It: IntoIterator<Item = (AliasPattern, T)>,
    {
        for (pattern, value) in iter {
            self.insert(pattern, value);
        }
    }
}

/// An iterator over the aliases that match a request.
///
/// The items are returned in the order defined by [PATTERN_KEY_COMPARE].
///
/// [PATTERN_KEY_COMPARE]: https://nodejs.org/api/esm.html#resolver-algorithm-specification
pub struct AliasMapLookupIterator<'a, T> {
    request: &'a str,
    prefixes_stack: Vec<(&'a [u8], &'a BTreeMap<AliasKey, T>)>,
    current_prefix_iterator: Option<(&'a [u8], std::collections::btree_map::Iter<'a, AliasKey, T>)>,
}

impl<'a, T> Iterator for AliasMapLookupIterator<'a, T>
where
    T: AliasTemplate,
{
    type Item = AliasMatch<'a, T>;

    fn next(&mut self) -> Option<Self::Item> {
        let (prefix, current_prefix_iterator) = self.current_prefix_iterator.as_mut()?;

        loop {
            for (key, template) in &mut *current_prefix_iterator {
                match key {
                    AliasKey::Exact => {
                        if self.request.len() == prefix.len() {
                            return Some(AliasMatch::Exact(template));
                        }
                    }
                    AliasKey::Wildcard { suffix } => {
                        let remaining = &self.request[prefix.len()..];
                        if
                        // The suffix is longer than what remains of the request.
                        suffix.len() > remaining.len()
                            // Not a suffix match.
                            || !remaining.ends_with(suffix)
                        {
                            continue;
                        }
                        let capture = &remaining[..remaining.len() - suffix.len()];
                        let output = template.replace(capture);
                        return Some(AliasMatch::Replaced(output));
                    }
                }
            }

            let (new_prefix, new_current_prefix_iterator) = self.prefixes_stack.pop()?;
            *prefix = new_prefix;
            *current_prefix_iterator = new_current_prefix_iterator.iter();
        }
    }
}

/// An alias pattern.
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub enum AliasPattern {
    /// Will match an exact string.
    Exact(String),
    /// Will match a pattern with a single wildcard.
    Wildcard { prefix: String, suffix: String },
}

impl AliasPattern {
    /// Parses an alias pattern from a string.
    ///
    /// Wildcard characters (*) present in the string will match any number of
    /// characters, including path separators.
    pub fn parse<'a, T>(pattern: T) -> Self
    where
        T: Into<String> + 'a,
    {
        let mut pattern = pattern.into();
        if let Some(wildcard_index) = pattern.find('*') {
            let suffix = pattern[wildcard_index + 1..].to_string();
            pattern.truncate(wildcard_index);
            AliasPattern::Wildcard {
                prefix: pattern,
                suffix,
            }
        } else {
            AliasPattern::Exact(pattern.to_string())
        }
    }

    /// Creates a pattern that will only match exactly what was passed in.
    pub fn exact<'a, T>(pattern: T) -> Self
    where
        T: Into<String> + 'a,
    {
        AliasPattern::Exact(pattern.into())
    }

    /// Creates a pattern that will match, sequentially:
    /// 1. a prefix; then
    /// 2. any number of characters, including path separators; then
    /// 3. a suffix.
    pub fn wildcard<'p, 's, P, S>(prefix: P, suffix: S) -> Self
    where
        P: Into<String> + 'p,
        S: Into<String> + 's,
    {
        AliasPattern::Wildcard {
            prefix: prefix.into(),
            suffix: suffix.into(),
        }
    }
}

#[derive(Debug, Clone, Eq, PartialEq, Serialize, Deserialize, TraceRawVcs)]
enum AliasKey {
    Exact,
    Wildcard { suffix: String },
}

/// Result of a lookup in the alias map.
#[derive(Debug)]
pub enum AliasMatch<'a, T>
where
    T: AliasTemplate,
{
    /// The request matched an exact alias.
    Exact(&'a T),
    /// The request matched a wildcard alias.
    Replaced(T::Output<'a>),
}

impl<'a, T> AliasMatch<'a, T>
where
    T: AliasTemplate,
{
    /// Returns the exact match, if any.
    pub fn as_exact(&self) -> Option<&'a T> {
        if let Self::Exact(v) = self {
            Some(v)
        } else {
            None
        }
    }

    /// Returns the replaced match, if any.
    pub fn as_replaced(&self) -> Option<&T::Output<'a>> {
        if let Self::Replaced(v) = self {
            Some(v)
        } else {
            None
        }
    }

    /// Returns the replaced match, if any.
    ///
    /// Consumes the match.
    pub fn into_replaced(self) -> Option<T::Output<'a>> {
        if let Self::Replaced(v) = self {
            Some(v)
        } else {
            None
        }
    }
}

impl<'a, T> AliasMatch<'a, T>
where
    T: AliasTemplate<Output<'a> = T>,
{
    /// Returns the wrapped value.
    ///
    /// Only implemented when `T::Output` is `T`.
    pub fn as_self(&'a self) -> &'a T {
        match self {
            Self::Exact(v) => v,
            Self::Replaced(v) => v,
        }
    }
}

impl<'a, T, E> AliasMatch<'a, T>
where
    T: AliasTemplate<Output<'a> = Result<T, E>> + Clone,
{
    /// Returns the wrapped value.
    ///
    /// Consumes the match.
    ///
    /// Only implemented when `T::Output` is `Result<T, _>`.
    pub fn try_into_self(self) -> Result<Cow<'a, T>, E> {
        Ok(match self {
            Self::Exact(v) => Cow::Borrowed(v),
            Self::Replaced(v) => Cow::Owned(v?),
        })
    }
}

impl<'a, T, E, F> AliasMatch<'a, T>
where
    F: Future<Output = Result<T, E>>,
    T: AliasTemplate<Output<'a> = F> + Clone,
{
    /// Returns the wrapped value.
    ///
    /// Consumes the match.
    ///
    /// Only implemented when `T::Output` is `impl Future<Result<T, _>>`
    pub async fn try_join_into_self(self) -> Result<Cow<'a, T>, E> {
        Ok(match self {
            Self::Exact(v) => Cow::Borrowed(v),
            Self::Replaced(v) => Cow::Owned(v.await?),
        })
    }
}

impl PartialOrd for AliasKey {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for AliasKey {
    /// According to [PATTERN_KEY_COMPARE].
    ///
    /// [PATTERN_KEY_COMPARE]: https://nodejs.org/api/esm.html#resolver-algorithm-specification
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        match (self, other) {
            (AliasKey::Wildcard { suffix: l_suffix }, AliasKey::Wildcard { suffix: r_suffix }) => {
                l_suffix
                    .len()
                    .cmp(&r_suffix.len())
                    .reverse()
                    .then_with(|| l_suffix.cmp(r_suffix))
            }
            (AliasKey::Wildcard { .. }, _) => std::cmp::Ordering::Less,
            (_, AliasKey::Wildcard { .. }) => std::cmp::Ordering::Greater,
            _ => std::cmp::Ordering::Equal,
        }
    }
}

/// A trait for types that can be used as a template for an alias.
pub trait AliasTemplate {
    /// The type of the output of the replacement.
    type Output<'a>
    where
        Self: 'a;

    /// Replaces `capture` within `self`.
    fn replace<'a>(&'a self, capture: &'a str) -> Self::Output<'a>;
}

#[cfg(test)]
mod test {
    use std::{assert_matches::assert_matches, borrow::Cow};

    use super::{AliasMap, AliasPattern, AliasTemplate};

    /// Asserts that an [`AliasMap`] lookup yields the expected results. The
    /// order of the results is important.
    ///
    /// See below for usage examples.
    macro_rules! assert_alias_matches {
        ($map:expr, $request:expr$(, $($tail:tt)*)?) => {
            let mut lookup = $map.lookup($request);

            $(assert_alias_matches!(@next lookup, $($tail)*);)?
            assert_matches!(lookup.next(), None);
        };

        (@next $lookup:ident, exact($pattern:pat)$(, $($tail:tt)*)?) => {
            assert_matches!($lookup.next(), Some(super::AliasMatch::Exact($pattern)));
            $(assert_alias_matches!(@next $lookup, $($tail)*);)?
        };

        (@next $lookup:ident, replaced($pattern:pat)$(, $($tail:tt)*)?) => {
            assert_matches!($lookup.next(), Some(super::AliasMatch::Replaced(Cow::Borrowed($pattern))));
            $(assert_alias_matches!(@next $lookup, $($tail)*);)?
        };

        (@next $lookup:ident, replaced_owned($value:expr)$(, $($tail:tt)*)?) => {
            assert_matches!($lookup.next(), Some(super::AliasMatch::Replaced(Cow::Owned(s))) if s == $value);
            $(assert_alias_matches!(@next $lookup, $($tail)*);)?
        };

        // Handle trailing comma.
        (@next $lookup:ident,) => {};
    }

    impl<'a> AliasTemplate for &'a str {
        type Output<'b> = Cow<'a, str> where Self: 'b;

        fn replace(&self, capture: &str) -> Self::Output<'a> {
            if let Some(index) = self.find('*') {
                let mut output = String::with_capacity(self.len() - 1 + capture.len());
                output.push_str(&self[..index]);
                output.push_str(capture);
                output.push_str(&self[index + 1..]);
                Cow::Owned(output)
            } else {
                Cow::Borrowed(*self)
            }
        }
    }

    #[test]
    fn test_one_exact() {
        let mut map = AliasMap::new();
        map.insert(AliasPattern::parse("foo"), "bar");

        assert_alias_matches!(map, "");
        assert_alias_matches!(map, "foo", exact(&"bar"));
        assert_alias_matches!(map, "foobar");
    }

    #[test]
    fn test_many_exact() {
        let mut map = AliasMap::new();
        map.insert(AliasPattern::parse("foo"), "bar");
        map.insert(AliasPattern::parse("bar"), "foo");
        map.insert(AliasPattern::parse("foobar"), "barfoo");

        assert_alias_matches!(map, "");
        assert_alias_matches!(map, "foo", exact(&"bar"));
        assert_alias_matches!(map, "bar", exact(&"foo"));
        assert_alias_matches!(map, "foobar", exact(&"barfoo"));
    }

    #[test]
    fn test_empty() {
        let mut map = AliasMap::new();
        map.insert(AliasPattern::parse(""), "empty");
        map.insert(AliasPattern::parse("foo"), "bar");

        assert_alias_matches!(map, "", exact(&"empty"));
        assert_alias_matches!(map, "foo", exact(&"bar"));
    }

    #[test]
    fn test_left_wildcard() {
        let mut map = AliasMap::new();
        map.insert(AliasPattern::parse("foo*"), "bar");

        assert_alias_matches!(map, "");
        assert_alias_matches!(map, "foo", replaced("bar"));
        assert_alias_matches!(map, "foobar", replaced("bar"));
    }

    #[test]
    fn test_wildcard_replace_suffix() {
        let mut map = AliasMap::new();
        map.insert(AliasPattern::parse("foo*"), "bar*");
        map.insert(AliasPattern::parse("foofoo*"), "barbar*");

        assert_alias_matches!(map, "");
        assert_alias_matches!(map, "foo", replaced_owned("bar"));
        assert_alias_matches!(map, "foobar", replaced_owned("barbar"));
        assert_alias_matches!(
            map,
            "foofoobar",
            // The longer prefix should come first.
            replaced_owned("barbarbar"),
            replaced_owned("barfoobar"),
        );
    }

    #[test]
    fn test_wildcard_replace_prefix() {
        let mut map = AliasMap::new();
        map.insert(AliasPattern::parse("*foo"), "*bar");
        map.insert(AliasPattern::parse("*foofoo"), "*barbar");

        assert_alias_matches!(map, "");
        assert_alias_matches!(map, "foo", replaced_owned("bar"));
        assert_alias_matches!(map, "barfoo", replaced_owned("barbar"));
        assert_alias_matches!(
            map,
            "barfoofoo",
            // The longer suffix should come first.
            replaced_owned("barbarbar"),
            replaced_owned("barfoobar"),
        );
    }

    #[test]
    fn test_wildcard_replace_infix() {
        let mut map = AliasMap::new();
        map.insert(AliasPattern::parse("foo*foo"), "bar*bar");
        map.insert(AliasPattern::parse("foo*foofoo"), "bar*barbar");
        map.insert(AliasPattern::parse("foofoo*foo"), "bazbaz*baz");

        assert_alias_matches!(map, "");
        assert_alias_matches!(map, "foo");
        assert_alias_matches!(map, "foofoo", replaced_owned("barbar"));
        assert_alias_matches!(map, "foobazfoo", replaced_owned("barbazbar"));
        assert_alias_matches!(
            map,
            "foofoofoo",
            // The longer prefix should come first.
            replaced_owned("bazbazbaz"),
            // Then the longer suffix.
            replaced_owned("barbarbar"),
            replaced_owned("barfoobar"),
        );
        assert_alias_matches!(
            map,
            "foobazfoofoo",
            // The longer suffix should come first.
            replaced_owned("barbazbarbar"),
            replaced_owned("barbazfoobar"),
        );
        assert_alias_matches!(
            map,
            "foofoobarfoo",
            // The longer prefix should come first.
            replaced_owned("bazbazbarbaz"),
            replaced_owned("barfoobarbar"),
        );
        assert_alias_matches!(
            map,
            "foofoofoofoofoo",
            // The longer prefix should come first.
            replaced_owned("bazbazfoofoobaz"),
            // Then the longer suffix.
            replaced_owned("barfoofoobarbar"),
            replaced_owned("barfoofoofoobar"),
        );
    }

    #[test]
    fn test_wildcard_replace_only() {
        let mut map = AliasMap::new();
        map.insert(AliasPattern::parse("*"), "foo*foo");
        map.insert(AliasPattern::parse("**"), "bar*foo");

        assert_alias_matches!(map, "", replaced_owned("foofoo"));
        assert_alias_matches!(map, "bar", replaced_owned("foobarfoo"));
        assert_alias_matches!(
            map,
            "*",
            replaced_owned("barfoo"),
            replaced_owned("foo*foo"),
        );
        assert_alias_matches!(
            map,
            "**",
            replaced_owned("bar*foo"),
            replaced_owned("foo**foo")
        );
    }
}
