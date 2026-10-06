//! Deterministic assignment of short, valid JS identifiers to a set of names.
//!
//! Used to shorten module export keys: the keys only exist to link modules together, so as long as
//! producer and consumer agree on the same short key, the original (possibly very long) name never
//! has to appear in the output.
//!
//! The mapping is built so that names stay **stable** across unrelated changes — a plain sequential
//! assignment (`a`, `b`, `c`, …) would renumber everything whenever a name is added or removed.
//! Instead each name is hashed into a table of all valid identifiers of the chosen length, and
//! collisions are resolved by open addressing (take the next free bucket, wrapping around). With
//! many collisions this degrades to sequential assignment, but in the common case a name's short
//! form only depends on the name itself and the size of the table.
//!
//! The assigned names are only ever emitted as **property keys** — object-literal keys in the
//! generated export table, and bracket-access strings at the consuming side. They are never used as
//! bare binding identifiers (the merged / scope-hoisted path refers to the module's own local
//! variables, not to these keys), so a name that happens to spell a reserved word like `if` or `in`
//! is perfectly legal. It is avoided anyway — see `RESERVED_KEYS` in the parent module — because a
//! downstream minifier that folds `ns["name"]` into the shorter `ns.name` typically only does so
//! for a non-reserved identifier, so a keyword-shaped key never gets that benefit.

use rustc_hash::FxHashSet;
use turbo_frozenmap::FrozenMap;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks_hash::hash_xxh3_hash64;

/// Characters that may start an identifier (i.e. no digits).
const FIRST_CHARS: &[u8; 54] = b"_$ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
/// Characters that may appear in an identifier after the first character.
const REST_CHARS: &[u8; 64] = b"_$0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/// The name assigned when a module has exactly one export to mangle.
///
/// Always picking the same character compresses better than hashing would: `f` is the most common
/// character in JS keywords (`if`, `for`, `function`), and every single-export module in the graph
/// then emits the same `.f` / `.f()` byte sequences, which gzip's back-references pick up across
/// the whole bundle. The cost is that going from one export to two renames this one; that churn is
/// accepted deliberately in exchange for the compression.
const SINGLE_ITEM_IDENTIFIER: RcStr = rcstr!("f");

/// Keys that are never handed out, for two different reasons.
///
/// The reserved words are legal as quoted keys, but a minifier will not fold `ns["if"]` into
/// `ns.if`, so handing one out costs bytes where any other key of the same length saves them. Only
/// two- and three-character words are listed: no single character is a reserved word, and by four
/// characters the table holds 200k+ buckets, so losing a name there is irrelevant.
///
/// `__esModule` is a correctness case instead: `esm()` in the runtime does
/// `defineProp(exports, '__esModule', …)` for every ESM module, so that property is on the exports
/// object whatever the module's own exports are called, and an assigned key would collide with it.
/// (`default` needs no such treatment once it is mangled: nothing then emits a property under that
/// name, and the runtime paths that read it by name only see modules that keep their original
/// names.)
///
/// [`reserved_in_table`] has to be kept in step with this list — there is a test for that.
const RESERVED_KEYS: &[&str] = &[
    // 2-character reserved words
    "do",
    "if",
    "in",
    // 3-character reserved words. `let` counts: the output is a module, and modules are strict.
    "for",
    "let",
    "new",
    "try",
    "var",
    // Defined on every module's exports object by the runtime, whatever the module's own exports
    // are called, so an assigned key must not land on it.
    "__esModule",
];

/// How many of [`RESERVED_KEYS`] occupy a bucket in a table of `len`-character identifiers. A key
/// only takes a bucket once the table is wide enough to hold it, so this is a running count by
/// length: nothing at one character, the three two-letter words at two, all eight reserved words
/// from three, and `__esModule` from ten.
const fn reserved_in_table(len: u32) -> u64 {
    match len {
        0 | 1 => 0,
        2 => 3,
        3..=9 => 8,
        _ => 9,
    }
}

/// The number of distinct values encodable in at most `len` characters, i.e. the capacity of the
/// table for that length.
///
/// There are `54 * 64^(i-1)` strings of length `i` — the first character comes from the 54 that may
/// start an identifier, every later one from all 64 — so this is that summed over `1..=len`:
///
/// ```text
/// capacity(len) = 54 * (64^len - 1) / 63
/// ```
///
/// Precomputed rather than evaluated on the fly, because [`decode_js_identifier`] needs it for
/// every name it decodes and the formula costs a `pow` and a multiply.
/// [`capacity_for_len_matches_the_formula`] keeps the table honest. From `len == 11` the true value
/// exceeds `u64::MAX` (`54 * 64^10` alone is ≈ 6.2e19 against `u64::MAX`'s ≈ 1.8e19), so it
/// saturates there; no real export table comes anywhere near needing that many characters.
fn capacity_for_len(len: u32) -> u64 {
    CAPACITY_FOR_LEN
        .get(len as usize)
        .copied()
        .unwrap_or(u64::MAX)
}

/// See [`capacity_for_len`].
const CAPACITY_FOR_LEN: [u64; 11] = [
    0,
    54,
    3_510,
    224_694,
    14_380_470,
    920_350_134,
    58_902_408_630,
    3_769_754_152_374,
    241_264_265_751_990,
    15_440_913_008_127_414,
    988_218_432_520_154_550,
];

/// Encodes a value to a valid JS identifier. Always returns at least one character.
///
/// Values are partitioned by the length of their encoding: the lowest [`FIRST_CHARS`]`.len()`
/// values are the one-character strings, the next `54 * 64` are the two-character ones, and so on.
/// Peeling those groups off in order turns `value` into a plain index within its own length, which
/// is then written out most-significant character first.
fn encode_js_identifier(mut value: u64) -> String {
    let mut len = 1usize;
    let mut in_this_len = FIRST_CHARS.len() as u64;
    while value >= in_this_len {
        value -= in_this_len;
        len += 1;
        in_this_len = in_this_len.saturating_mul(REST_CHARS.len() as u64);
    }

    let mut result = vec![0u8; len];
    // Fill from the tail, so the last character is the least significant digit.
    for slot in result[1..].iter_mut().rev() {
        *slot = REST_CHARS[(value % REST_CHARS.len() as u64) as usize];
        value /= REST_CHARS.len() as u64;
    }
    // Whatever is left is below `FIRST_CHARS.len()`, by construction of the length groups above.
    result[0] = FIRST_CHARS[value as usize];

    // SAFETY: FIRST_CHARS and REST_CHARS only contain ASCII
    unsafe { String::from_utf8_unchecked(result) }
}

/// Decodes an identifier back to the value [`encode_js_identifier`] would encode.
///
/// Returns `None` only when the string contains a character outside the alphabets, or is too long
/// to be a `u64`. Every other non-empty string is the encoding of exactly one value: accumulating
/// `value * base + digit` and then adding the values taken by all shorter strings means a trailing
/// `_` is a digit like any other rather than a leading zero, so there are no degenerate encodings
/// to reject. That bijection is what lets an existing short export name keep itself without ever
/// colliding with a name assigned to something else.
///
/// Panics on an empty string: export names are never empty, so that would be a caller bug rather
/// than an un-decodable name.
fn decode_js_identifier(s: &str) -> Option<u64> {
    let bytes = s.as_bytes();
    let (&first, rest) = bytes
        .split_first()
        .expect("identifiers are never empty, so neither are export names");

    let mut value = FIRST_CHARS.iter().position(|&c| c == first)? as u64;
    for &b in rest {
        let digit = REST_CHARS.iter().position(|&c| c == b)? as u64;
        value = value
            .checked_mul(REST_CHARS.len() as u64)?
            .checked_add(digit)?;
    }

    // Shift past every value that belongs to a shorter encoding.
    value.checked_add(capacity_for_len(s.len() as u32 - 1))
}

/// The bucket `name` occupies in a table of `len`-character identifiers, if it occupies one: the
/// name has to fit, and it has to be a name the encoding could itself produce.
fn bucket_of(name: &str, len: u32) -> Option<u64> {
    if name.len() as u32 > len {
        return None;
    }
    decode_js_identifier(name)
}

/// Assigns a short, unique identifier to each of `names`, deterministically.
///
/// The returned map only has an entry for a name that actually changed — a name that already fit
/// and kept itself is simply absent, so a caller must treat a missing key as "keep the original
/// name", not as "not eligible" (that distinction, when it matters, has to come from elsewhere;
/// see the doc comment on [`super::MangledExportNames`]).
///
/// [`RESERVED_KEYS`] are never handed out, even though they are not themselves assigned a short
/// name.
///
/// A module with a single export to mangle is special-cased to [`SINGLE_ITEM_IDENTIFIER`], so that
/// every such module in the graph emits the same key and compresses together.
///
/// The table is sized to the smallest identifier length that can hold every name that needs a
/// bucket, and assignment happens in two passes:
///
/// 1. Every name that is *already* a valid identifier of at most that length keeps itself and
///    reserves its bucket, as does every reserved key that falls inside the table. This has to
///    happen for **all** names before anything is hashed, or a hashed name could take a bucket that
///    a later preserved name needs.
/// 2. The remaining names are hashed into the table, resolving collisions by open addressing.
///
/// Both passes iterate in sorted order, so the result depends only on the *set* of names, never on
/// the order they arrive in.
pub fn shorten_to_unique_names<'a>(
    names: impl IntoIterator<Item = &'a RcStr>,
) -> FrozenMap<RcStr, RcStr> {
    let mut names: Vec<&RcStr> = names.into_iter().collect();
    names.sort_unstable();
    names.dedup();

    if names.is_empty() {
        return FrozenMap::default();
    }

    // A lone export always gets the same name, which compresses better across modules than a
    // hashed one would — unless it is already short enough to keep, in which case it is omitted
    // entirely (see the doc comment on the return value below).
    if let [name] = names[..] {
        return if bucket_of(name, 1).is_some() {
            FrozenMap::default()
        } else {
            FrozenMap::from_iter([((*name).clone(), SINGLE_ITEM_IDENTIFIER)])
        };
    }

    // Grow the table until it can hold the names *and* the reserved buckets that fall inside it.
    // Reserving can only ever push us up by the number of reserved keys, so this terminates.
    let mut len = 1;
    while capacity_for_len(len) < names.len() as u64 + reserved_in_table(len) {
        len += 1;
    }
    let capacity = capacity_for_len(len);

    // Only entries for names that actually changed are kept — see the doc comment on the return
    // value below — so this is sized for the common case (most names get hashed) rather than for
    // every name.
    let mut result = Vec::with_capacity(names.len());
    let mut used =
        FxHashSet::with_capacity_and_hasher(names.len() + RESERVED_KEYS.len(), Default::default());

    for name in RESERVED_KEYS {
        if let Some(bucket) = bucket_of(name, len) {
            used.insert(bucket);
        }
    }

    // Pass 1: names that are already valid short identifiers keep themselves and claim their
    // bucket — nothing to record, since keeping a name is exactly what an absent entry means.
    // This must complete before any hashing happens.
    let mut to_mangle = Vec::with_capacity(names.len());
    for name in names {
        match bucket_of(name, len) {
            // A name that is also reserved can't keep itself; it gets a fresh bucket below.
            Some(bucket) if used.insert(bucket) => {}
            _ => to_mangle.push(name),
        }
    }

    // Pass 2: hash the rest into the table, probing linearly on collision. The assigned identifier
    // can never equal the original name here: either the name never encoded to a valid identifier
    // at all (so it can't equal one now), or it did but lost its own bucket to something else in
    // pass 1, and a different bucket always encodes to a different string.
    for name in to_mangle {
        let mut bucket = hash_xxh3_hash64(name.as_str()) % capacity;
        while !used.insert(bucket) {
            bucket = (bucket + 1) % capacity;
        }
        result.push((name.clone(), RcStr::from(encode_js_identifier(bucket))));
    }

    FrozenMap::from_iter(result)
}

#[cfg(test)]
mod tests {
    use rustc_hash::FxHashMap;

    use super::*;

    /// Test convenience wrapper: [`shorten_to_unique_names`] itself only returns entries for names
    /// that actually changed (see its doc comment), but most of the tests below read more
    /// naturally against a *complete* map — one entry per input name, with an absent one filled in
    /// as identity — so this reconstructs that view.
    fn shorten(names: &[&str]) -> FxHashMap<RcStr, RcStr> {
        let names: Vec<RcStr> = names.iter().map(|name| RcStr::from(*name)).collect();
        let mangled = shorten_to_unique_names(names.iter());
        names
            .iter()
            .map(|name| {
                let mangled = mangled.get(name).cloned().unwrap_or_else(|| name.clone());
                (name.clone(), mangled)
            })
            .collect()
    }

    fn assert_all_unique(map: &FxHashMap<RcStr, RcStr>) {
        let mut values: Vec<_> = map.values().cloned().collect();
        values.sort();
        let before = values.len();
        values.dedup();
        assert_eq!(
            values.len(),
            before,
            "mangled names are not unique: {map:?}"
        );
    }

    fn numbered(count: usize) -> Vec<String> {
        (0..count).map(|i| format!("exportNumber{i:02}")).collect()
    }

    #[test]
    fn encode_decode_roundtrip() {
        for value in [
            0,
            1,
            52,
            53,
            54,
            55,
            100,
            1000,
            10_000,
            100_000,
            u32::MAX as u64,
            u64::MAX,
        ] {
            let encoded = encode_js_identifier(value);
            assert_eq!(
                decode_js_identifier(&encoded),
                Some(value),
                "roundtrip failed for {value} ({encoded})"
            );
        }
    }

    #[test]
    fn encoding_is_injective() {
        // The property the assignment relies on: distinct buckets never render to the same name, so
        // a name preserved in pass 1 can never be handed out again in pass 2. A trailing `_` is an
        // ordinary digit here, so there is nothing to exclude.
        let mut seen = FxHashMap::default();
        for value in 0..30_000u64 {
            let encoded = encode_js_identifier(value);
            if let Some(previous) = seen.insert(encoded.clone(), value) {
                panic!("{value} and {previous} both encode to {encoded}");
            }
        }
    }

    #[test]
    fn every_name_in_the_alphabet_decodes() {
        // A trailing `_` is no longer degenerate: it is a digit like any other, and these are
        // distinct values rather than aliases of a shorter name.
        assert_eq!(decode_js_identifier("_"), Some(0));
        assert_ne!(decode_js_identifier("__"), decode_js_identifier("_"));
        assert_ne!(decode_js_identifier("a_"), decode_js_identifier("a"));
        for name in ["_", "__", "a_", "a", "if", "__esModule"] {
            let value = decode_js_identifier(name).expect("in the alphabet");
            assert_eq!(encode_js_identifier(value), name, "roundtrip via {name}");
        }

        // Only characters outside the alphabets fail to decode.
        assert_eq!(decode_js_identifier("a-b"), None);
        assert_eq!(decode_js_identifier("é"), None);
        // Digits may not lead an identifier.
        assert_eq!(decode_js_identifier("0a"), None);
    }

    #[test]
    #[should_panic(expected = "identifiers are never empty")]
    fn empty_name_panics() {
        // An empty export name is a caller bug, not an un-decodable name.
        decode_js_identifier("");
    }

    #[test]
    fn table_length_follows_capacity() {
        assert_eq!(capacity_for_len(1), 54);
        assert_eq!(capacity_for_len(2), 54 + 54 * 64);

        // The worked example: 15 exports fit in one character.
        let names = numbered(15);
        let map = shorten(&names.iter().map(String::as_str).collect::<Vec<_>>());
        assert_eq!(map.len(), 15);
        for mangled in map.values() {
            assert_eq!(
                mangled.chars().count(),
                1,
                "expected 1 character: {mangled}"
            );
        }

        // 55 names no longer fit, so the table grows a character.
        let names = numbered(55);
        let map = shorten(&names.iter().map(String::as_str).collect::<Vec<_>>());
        assert_eq!(map.len(), 55);
        assert!(map.values().any(|m| m.chars().count() == 2));
    }

    #[test]
    fn short_names_are_preserved() {
        let map = shorten(&["a", "longExportName"]);
        assert_eq!(map.get("a").map(RcStr::as_str), Some("a"));
        assert_ne!(map.get("longExportName").map(RcStr::as_str), Some("a"));
        assert_all_unique(&map);
    }

    #[test]
    fn preserved_names_claim_their_bucket_before_hashing() {
        // The preservable names deliberately sort *last*, so an implementation that assigned hashed
        // names as it walked the list would already have handed out their buckets.
        let mut names = numbered(40);
        names.push("z".to_string());
        names.push("A".to_string());
        names.push("$".to_string());

        let map = shorten(&names.iter().map(String::as_str).collect::<Vec<_>>());
        assert_eq!(map.get("z").map(RcStr::as_str), Some("z"));
        assert_eq!(map.get("A").map(RcStr::as_str), Some("A"));
        assert_eq!(map.get("$").map(RcStr::as_str), Some("$"));
        for (name, mangled) in &map {
            if !matches!(name.as_str(), "z" | "A" | "$") {
                assert!(
                    !matches!(mangled.as_str(), "z" | "A" | "$"),
                    "{name} was assigned the preserved name {mangled}"
                );
            }
        }
        assert_all_unique(&map);
    }

    #[test]
    fn a_single_export_always_gets_the_same_name() {
        // Every single-export module in the graph emits the same key, so the `.f` / `.f()` byte
        // sequences repeat across the bundle and compress together. The cost is that adding a
        // second export renames this one, which is accepted deliberately.
        let one = shorten(&["someVeryLongExportName"]);
        assert_eq!(
            one.get("someVeryLongExportName").map(RcStr::as_str),
            Some("f")
        );
        assert_eq!(
            shorten(&["aCompletelyDifferentName"])
                .get("aCompletelyDifferentName")
                .map(RcStr::as_str),
            Some("f"),
            "a lone export should not depend on its own name"
        );
    }

    #[test]
    fn a_single_short_export_still_keeps_itself() {
        assert_eq!(shorten(&["a"]).get("a").map(RcStr::as_str), Some("a"));
    }

    #[test]
    fn empty() {
        assert!(shorten(&[]).is_empty());
    }

    #[test]
    fn unique_under_heavy_collision() {
        let names: Vec<String> = (0..100).map(|i| format!("export_{i}")).collect();
        let map = shorten(&names.iter().map(String::as_str).collect::<Vec<_>>());
        assert_eq!(map.len(), 100);
        assert_all_unique(&map);
    }

    #[test]
    fn assignment_is_order_independent() {
        let forward = shorten(&["foobar", "barbaz", "bazqux", "a", "reallyLongName"]);
        let backward = shorten(&["reallyLongName", "a", "bazqux", "barbaz", "foobar"]);
        assert_eq!(forward, backward);
    }

    #[test]
    fn duplicate_names_are_collapsed() {
        let map = shorten(&["foobar", "foobar", "barbaz"]);
        assert_eq!(map.len(), 2);
        assert_all_unique(&map);
    }

    #[test]
    fn collisions_take_the_next_bucket() {
        // Fill the single-character table completely: with 54 names every bucket is taken, so every
        // name still gets a distinct single character — only possible if collisions probe on.
        let names: Vec<String> = (0..54).map(|i| format!("collidingExport{i:02}")).collect();
        let map = shorten(&names.iter().map(String::as_str).collect::<Vec<_>>());
        assert_eq!(map.len(), 54);
        assert_all_unique(&map);
        for mangled in map.values() {
            assert_eq!(
                mangled.chars().count(),
                1,
                "expected 1 character: {mangled}"
            );
        }
        assert_eq!(map.len(), FIRST_CHARS.len());
    }

    #[test]
    fn probing_wraps_around_the_table() {
        // Every bucket but one is claimed by a preserved name, so the hashed name has to wrap
        // around the end of the value space to find the only free bucket.
        let free = FIRST_CHARS[7] as char;
        let mut names: Vec<String> = FIRST_CHARS
            .iter()
            .map(|&c| (c as char).to_string())
            .filter(|c| c != &free.to_string())
            .collect();
        names.push("aNameThatNeedsMangling".to_string());

        let map = shorten(&names.iter().map(String::as_str).collect::<Vec<_>>());
        assert_eq!(
            map.get("aNameThatNeedsMangling").map(RcStr::as_str),
            Some(free.to_string().as_str()),
            "the only free bucket should have been found by wrapping"
        );
        assert_all_unique(&map);
    }

    #[test]
    fn adding_a_name_within_the_same_tier_keeps_others_stable() {
        let before = numbered(20);
        let mut after = before.clone();
        after.push("oneMoreExport".to_string());

        let map_before = shorten(&before.iter().map(String::as_str).collect::<Vec<_>>());
        let map_after = shorten(&after.iter().map(String::as_str).collect::<Vec<_>>());

        // Same tier, so the modulus is unchanged: only names in the collision cluster of the new
        // name may move.
        let moved = map_before
            .iter()
            .filter(|(name, mangled)| map_after.get(*name) != Some(*mangled))
            .count();
        assert!(
            moved <= 2,
            "adding one name moved {moved} of {} existing names",
            map_before.len()
        );
    }

    #[test]
    fn reserved_names_are_never_assigned() {
        // Enough names that the two-character table is crowded, so a reserved bucket would be
        // reached if it were not withheld.
        let names: Vec<String> = (0..3000)
            .map(|i| format!("collidingExport{i:04}"))
            .collect();
        let names: Vec<&str> = names.iter().map(String::as_str).collect();
        let map = shorten(&names);
        assert_eq!(map.len(), 3000);
        assert_all_unique(&map);
        for mangled in map.values() {
            assert!(
                !RESERVED_KEYS.contains(&mangled.as_str()),
                "handed out the reserved key {mangled}"
            );
        }
    }

    #[test]
    fn a_name_that_is_itself_reserved_does_not_keep_itself() {
        // `in` would normally keep its own name, but it is reserved, so it gets a fresh bucket.
        let map = shorten(&["in", "someLongExportName"]);
        assert_ne!(map.get("in").map(RcStr::as_str), Some("in"));
        assert_all_unique(&map);
    }

    #[test]
    fn reserved_bucket_count_matches_the_reserved_list() {
        // `reserved_in_table` is maintained by hand; keep it honest against the list it summarizes.
        for len in 1..=12u32 {
            let counted = RESERVED_KEYS
                .iter()
                .filter(|name| bucket_of(name, len).is_some())
                .count() as u64;
            assert_eq!(
                reserved_in_table(len),
                counted,
                "reserved_in_table({len}) disagrees with RESERVED_KEYS"
            );
        }
    }

    #[test]
    fn capacity_for_len_matches_the_formula() {
        // `CAPACITY_FOR_LEN` is precomputed to keep it off `decode_js_identifier`'s hot path; keep
        // it honest against the closed form it stands in for, `54 * (64^len - 1) / 63`. Computed in
        // `u128` so this check doesn't itself rely on the saturation it is verifying.
        for len in 0..CAPACITY_FOR_LEN.len() as u32 {
            let first = FIRST_CHARS.len() as u128;
            let rest = REST_CHARS.len() as u128;
            let expected = first * (rest.pow(len) - 1) / (rest - 1);
            assert_eq!(
                capacity_for_len(len) as u128,
                expected,
                "capacity_for_len({len}) disagrees with the formula"
            );
        }
        // And confirm it still saturates beyond the precomputed range, rather than overflowing.
        assert_eq!(capacity_for_len(CAPACITY_FOR_LEN.len() as u32), u64::MAX);
        assert_eq!(capacity_for_len(1000), u64::MAX);
    }

    #[test]
    fn keyword_keys_are_never_handed_out() {
        // `ns["if"]` is legal but a minifier will not fold it to `ns.if`, so it costs bytes. The
        // words are withheld from the table like any other reserved key.
        for keyword in RESERVED_KEYS.iter().filter(|k| k.len() <= 3) {
            let value = decode_js_identifier(keyword)
                .unwrap_or_else(|| panic!("{keyword} should be in the encoding's image"));
            assert_eq!(
                encode_js_identifier(value),
                *keyword,
                "{keyword} must round-trip, or withholding its bucket does nothing"
            );
        }

        // Enough names to need two characters, which is where the words become reachable.
        let names: Vec<String> = (0..2000).map(|i| format!("exportNumber{i:04}")).collect();
        let names: Vec<&str> = names.iter().map(String::as_str).collect();
        let map = shorten(&names);
        assert_all_unique(&map);
        assert_eq!(map.len(), 2000);
        for mangled in map.values() {
            assert!(
                !RESERVED_KEYS.contains(&mangled.as_str()),
                "handed out the reserved key {mangled}"
            );
        }
    }

    #[test]
    fn an_export_named_like_a_keyword_is_renamed_away_from_it() {
        // Keeping `if` would emit `ns["if"]` (8 bytes); renaming it to a dot-accessible key gets
        // `ns.ab` (5), so withholding the word is a win even for a source name that is already
        // short enough to keep.
        let map = shorten(&["if", "someLongExportName"]);
        let mangled = map.get("if").unwrap();
        assert_ne!(mangled.as_str(), "if");
        assert_eq!(mangled.chars().count(), 1, "should still be a short key");
        assert_all_unique(&map);
    }
}
