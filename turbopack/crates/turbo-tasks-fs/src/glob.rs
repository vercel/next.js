use std::{fmt::Display, mem::take};

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
        // TODO(lukesandberg): deprecate this implicit behavior
        let match_partial = path.ends_with('/');
        self.iter_matches(path, true, match_partial)
            .any(|result| matches!(result, ("", _)))
    }

    // Returns true if the glob could match a filename underneath this `path` where the path
    // represents a directory.
    pub fn match_in_directory(&self, path: &str) -> bool {
        debug_assert!(!path.ends_with('/'));
        // TODO(lukesandberg): see if we can avoid this allocation by changing the matching
        // algorithm
        let path = format!("{path}/");
        self.iter_matches(&path, true, true)
            .any(|result| matches!(result, ("", _)))
    }

    fn iter_matches<'a>(
        &'a self,
        path: &'a str,
        previous_part_is_path_separator_equivalent: bool,
        match_in_directory: bool,
    ) -> GlobMatchesIterator<'a> {
        GlobMatchesIterator {
            current: path,
            glob: self,
            match_in_directory,
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
    // In this mode we are checking if the glob might match something in the directory represented
    // by this path.
    match_in_directory: bool,
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
                        self.match_in_directory,
                    );
                    self.stack.push(iter);
                    self.stack.last_mut().unwrap()
                };
                if let Some((new_path, new_is_path_separator_equivalent)) = iter.next() {
                    self.current = new_path;
                    self.is_path_separator_equivalent = new_is_path_separator_equivalent;

                    self.index += 1;

                    if self.match_in_directory && self.current.is_empty() {
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

#[derive(Debug, Eq, PartialEq, Copy, Clone)]
struct ByteRange {
    low: u8,
    high: u8,
}
impl ByteRange {
    fn singleton(b: u8) -> Self {
        Self { low: b, high: b }
    }
    fn range(low: u8, high: u8) -> Self {
        Self { low, high }
    }
}

impl PartialOrd for ByteRange {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}
// Lower `lows` come first, if two `lows` match then the large range comes first
// This makes the merge logic simpler.
impl Ord for ByteRange {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        match self.low.cmp(&other.low) {
            std::cmp::Ordering::Equal => other.high.cmp(&self.high),
            c => c,
        }
    }
}

#[derive(Debug, Eq, Clone, PartialEq)]
#[repr(transparent)]
struct RangeSet {
    ranges: Vec<ByteRange>,
}

impl RangeSet {
    fn new() -> RangeSet {
        Self { ranges: Vec::new() }
    }

    fn contains(&self, b: u8) -> bool {
        self.ranges.binary_search(&ByteRange::singleton(b)).is_ok()
    }

    fn add_singleton(&mut self, b: u8) {
        self.ranges.push(ByteRange::singleton(b));
    }
    fn add_range(&mut self, low: u8, high: u8) {
        self.ranges.push(ByteRange::range(low, high));
    }

    // Sorts and merges redundant entries.
    fn finalize(&mut self) {
        self.ranges.sort();
        self.ranges.dedup_by(|a, b| {
            if b.high >= a.low {
                b.high = a.high;
                true
            } else {
                false
            }
        });
        self.ranges.shrink_to_fit();
    }
}

// A sparse set of integers that supports O(1) insertion, testing, clearing and O(n) iteration.
// https://research.swtch.com/sparse
struct SparseSet<'a> {
    mem: &'a mut [u16],
    n: u16,
}

impl<'a> SparseSet<'a> {
    fn from_storage(mem: &'a mut [u16]) -> Self {
        debug_assert!(mem.len() & 1 == 0, "mem must have an even length");
        Self { mem, n: 0 }
    }
    // Sparse entries are stored at the even indices and dense entries are stored at the odd ones
    // this allows us to compute addresses withough referencing the length of the slice.

    #[inline]
    fn get_sparse(&self, i: u16) -> u16 {
        return self.mem[i as usize * 2];
    }
    #[inline]
    fn get_sparse_mut(&mut self, i: u16) -> &mut u16 {
        return &mut self.mem[i as usize * 2];
    }
    #[inline]
    fn get_dense(&self, i: u16) -> u16 {
        return self.mem[i as usize * 2 + 1];
    }
    #[inline]
    fn get_dense_mut(&mut self, i: u16) -> &mut u16 {
        return &mut self.mem[i as usize * 2 + 1];
    }

    fn clear(&mut self) {
        self.n = 0
    }
    fn add(&mut self, v: u16) -> bool {
        debug_assert!((v as usize) < self.mem.len() / 2);
        let n = self.n;
        let s = self.get_sparse(v);
        // The value is already in the set if
        // the sparse pointer is in range and the value at that
        // index is `v`
        if s < n && self.get_dense(s) == v {
            // this value is already in the set.
            return false;
        }
        *self.get_sparse_mut(v) = n;
        *self.get_dense_mut(n) = v;
        self.n += 1;
        true
    }
    fn get(&self, i: u16) -> u16 {
        debug_assert!(i < self.n);
        return self.get_dense(i);
    }
}

#[derive(Debug)]
pub struct GlobProgram {
    instructions: Vec<GlobInstruction>,
    range_sets: Vec<RangeSet>,
}

impl GlobProgram {
    pub fn compile(pattern: &str) -> Result<GlobProgram> {
        let mut tok = Tokenizer::new(pattern);
        let mut instructions = Vec::new();
        let mut range_sets = Vec::new();
        // A stack of alternates
        struct PendingAlternates {
            prefix: Vec<GlobInstruction>,
            branches: Vec<Vec<GlobInstruction>>,
        }
        let mut left_bracket_starts: Vec<PendingAlternates> = Vec::new();
        // We avoid synthesizing an AST and compile directly from the lexer, this adds a touch of
        // trickiness for alternations but that can be managed by a single stack and avoids the
        // complexity of building and visiting an AST. This simple program also allows
        // trivial optimizations to be performed during compilation inline.
        loop {
            let t = tok.next_token();
            match t {
                GlobToken::Literal(lit) => {
                    // If the previous token is a literal mark it as having a successor.
                    if let Some(GlobInstruction::MatchLiteral((_, has_next))) =
                        instructions.last_mut()
                    {
                        *has_next = true;
                    }
                    instructions.push(GlobInstruction::MatchLiteral((lit, false)));
                }
                GlobToken::Star => {
                    instructions.push(GlobInstruction::MatchAnyNonDelim);
                    // After a star match we either loop back to try again, or proceed.
                    instructions.push(GlobInstruction::Fork(-1));
                }
                GlobToken::GlobStar => {
                    if instructions.len() >= 2
                        && matches!(
                            instructions.last().unwrap(),
                            GlobInstruction::MatchGlobStar { .. }
                        )
                    {
                        // This is a redundant globstar
                        // e.g. /**/**/
                        // just skip this one.
                    } else {
                        // allow globstars to match nothing by skipping it
                        instructions.push(GlobInstruction::Fork(2));
                        // We don't actually know if it is terminal or not yet.  We will determing
                        // this after code generation.
                        instructions.push(GlobInstruction::MatchGlobStar { terminal: false });
                    }
                }
                GlobToken::QuestionMark => {
                    // A question match, optionally matches a non- delimiter character, so we either
                    // skip forward or not.
                    instructions.push(GlobInstruction::Fork(2));
                    instructions.push(GlobInstruction::MatchAnyNonDelim);
                }
                GlobToken::LSquareBracket => {
                    let mut set = RangeSet::new();
                    // with in a square brachet we expect a mix of literals and hyphens followed by
                    // a RSuareBracket
                    let mut prev_literal: Option<u8> = None;
                    let mut partial_range: Option<u8> = None;
                    loop {
                        let t = tok.next_token();
                        match t {
                            GlobToken::Literal(lit) => {
                                if lit > 127 {
                                    // TODO(lukesandberg): These are supportable by expanding into
                                    // several RanngeSets for
                                    // each byte in the multibyte characters
                                    // However, this is very unlikely to be required by a user so
                                    // for now the feature is
                                    // omitted.
                                    bail!("Unsupported non-ascii character in set");
                                }
                                debug_assert!(
                                    prev_literal.is_none(),
                                    "impossible, tokenizer failed to merge literals or we failed \
                                     to handle a hyphen correctly"
                                );
                                if let Some(start) = partial_range {
                                    set.add_range(start, lit);
                                    partial_range = None;
                                } else {
                                    if let Some(prev) = prev_literal {
                                        set.add_singleton(prev);
                                    }
                                    prev_literal = Some(lit);
                                }
                            }
                            GlobToken::Hyphen => {
                                if let Some(lit) = prev_literal {
                                    prev_literal = None;
                                    partial_range = Some(lit);
                                } else {
                                    bail!("Unexpected hyphen at the beginning of a character class")
                                }
                            }

                            GlobToken::RSquareBracket => {
                                if let Some(lit) = prev_literal {
                                    set.add_singleton(lit);
                                }
                                if partial_range.is_some() {
                                    bail!("unexpectedm hyphen at the end of a character class")
                                }
                                set.finalize();
                                let index = range_sets.len();
                                range_sets.push(set);
                                instructions.push(GlobInstruction::MatchClass(
                                    index
                                        .try_into()
                                        .context("Cannot have more than 255 range sets")?,
                                ));
                                break;
                            }
                            _ => {
                                bail!("Unexpected token {t} inside of character class");
                            }
                        }
                    }
                }
                GlobToken::RSquareBracket | GlobToken::Hyphen => panic!(
                    "should never happen, tokenizer should have already rejected or been consumed \
                     within another branch"
                ),
                GlobToken::LBracket => {
                    let mut tmp = Vec::new();
                    std::mem::swap(&mut instructions, &mut tmp);
                    left_bracket_starts.push(PendingAlternates {
                        prefix: tmp,
                        branches: Vec::new(),
                    });
                }
                GlobToken::Comma | GlobToken::RBracket => {
                    // We don't need to check this, the tokenizer enforces that these tokens can
                    // only occur inside of an alternation so there must be something on our stack.
                    let pending = left_bracket_starts.last_mut().unwrap();
                    // for an alternation we either 'jump' past it to the next one, or we process it
                    // directly

                    let mut branch = Vec::new();
                    std::mem::swap(&mut instructions, &mut branch);
                    pending.branches.push(branch);

                    // If we hit a `}` then we are done so compute the jumps and pop the prefix.
                    if t == GlobToken::RBracket {
                        let num_branches = pending.branches.len();
                        if num_branches == 1 {
                            bail!("Cannot have an alternation with only one member");
                        }
                        // TODO(lukesandberg): consider looking for common suffixes or prefixes,
                        // shouldn't be common

                        // The length of each branch plus one for the jump to the end
                        // For each alternative we have a `Fork` instruction so account for those
                        let mut next_branch_offset = num_branches - 1;
                        for branch in &pending.branches[0..num_branches - 1] {
                            // to jump past the branch we need to jump past all its instructions +1
                            // to account for the JUMP instruction at the end
                            next_branch_offset += branch.len() + 1;
                            pending.prefix.push(GlobInstruction::Fork(
                                next_branch_offset.try_into().context(
                                    "program too large, cannot have more than 64K instructions",
                                )?,
                            ));
                            next_branch_offset -= 1; // subtract one since we added a fork
                                                     // instruction.
                        }
                        // NOTE: The last branch doesn't get a JUMP instruction, so no `+1`
                        // this is the relative offet to the end, from the very beginning
                        // however we aren't starting at the beginning, we already added
                        // `num_branches-1` `FORK` instructions`
                        let mut end_of_alternation =
                            next_branch_offset + pending.branches.last().unwrap().len();
                        for branch in &mut pending.branches[0..num_branches - 1] {
                            end_of_alternation -= branch.len(); // from the end of this branch, this is how far it is to the end of the
                                                                // alternation
                            pending.prefix.extend(branch.drain(..));
                            pending.prefix.push(GlobInstruction::Jump(
                                end_of_alternation.try_into().context(
                                    "program too large, cannot have more than 64K instructions",
                                )?,
                            ));
                            end_of_alternation -= 1; // account for the jump instruction
                        }
                        end_of_alternation -= pending.branches.last().unwrap().len();
                        pending
                            .prefix
                            .extend(pending.branches.last_mut().unwrap().drain(..));
                        debug_assert!(end_of_alternation == 0);
                        std::mem::swap(&mut instructions, &mut pending.prefix);
                        left_bracket_starts.pop();
                    }
                }
                GlobToken::End => {
                    instructions.push(GlobInstruction::Match);
                    break;
                }
            }
        }
        if let Some(err) = tok.err {
            return Err(err);
        }

        // Now we need to annotate 'terminal' globstars in order to speed up validating program
        // matches The issue is that if we are executing a globstar when the program
        // completes then pass or fail is dependant upon whether there are unconditioal require
        // subsequent matches e.g. `foo/**` matches `foo/bar/baz.js` but foo/**/a` does not,
        // because we have to match that 'a' similarly `foo/{**,bar}` matches
        // `foo/bar/baz.js` Do determin this we need to chase pointers from globstars to the
        // end of the program, and if there is a path to match then it is a terminal globstar.

        if instructions.len() > u16::MAX as usize {
            bail!("program too large");
        }
        let mut storage = vec![0; instructions.len() * 2];
        let mut visited = SparseSet::from_storage(storage.as_mut_slice());
        for start in 0..(instructions.len() as u16) {
            if matches!(
                instructions[start as usize],
                GlobInstruction::MatchGlobStar { .. }
            ) {
                visited.add(start + 1);
                let mut thread_index = 0;
                while thread_index < visited.n {
                    let ip = visited.get(thread_index);
                    match &instructions[ip as usize] {
                        GlobInstruction::Fork(offset) => {
                            visited.add(ip + 1);
                            visited.add(((*offset as i16) + (ip as i16)) as u16);
                        }
                        GlobInstruction::Jump(offset) => {
                            visited.add(ip + *offset);
                        }
                        GlobInstruction::Match => {
                            // There is a path to the end, update to `terminal`
                            instructions[start as usize] =
                                GlobInstruction::MatchGlobStar { terminal: true };
                            break;
                        }
                        _ => {
                            break;
                        }
                    }
                    thread_index += 1;
                }

                // Check if this has an unconditional path to Match

                visited.clear();
            }
        }

        Ok(GlobProgram {
            instructions,
            range_sets,
        })
    }

    pub fn matches(&self, v: &str, prefix: bool) -> bool {
        let len = self.instructions.len();
        // Use a single uninitialize allocation for our storage.
        let mut storage: Vec<u16> =
            unsafe { std::mem::transmute(vec![std::mem::MaybeUninit::<u16>::uninit(); len * 4]) };
        let (set1, set2) = storage.split_at_mut(len * 2);
        let mut set1 = SparseSet::from_storage(set1);
        let mut set2 = SparseSet::from_storage(set2);
        // Access via references to make the swap operations cheaper.
        let mut cur = &mut set1;
        let mut next = &mut set2;
        cur.add(0);
        // Process all characters in order
        // It would be faster to process `bytes` but this adds complexity in a number of places

        let bytes = v.as_bytes();
        for i in 0..bytes.len() {
            let byte = bytes[i];
            let mut thread_index = 0;
            // We need to use this looping construct since we may add elements to `cur` as we go.
            // `cur.n` will never be > `len` so this loop is bounded to N iterations.
            let mut n_threads = cur.n;
            while thread_index < n_threads {
                let ip = cur.get(thread_index);
                match self.instructions[ip as usize] {
                    GlobInstruction::MatchLiteral((m, has_next)) => {
                        if byte == m {
                            // We matched, proceed to the next character
                            next.add(ip + 1);
                        }
                    }
                    GlobInstruction::MatchAnyNonDelim => {
                        if byte != b'/' {
                            next.add(ip + 1);
                        }
                    }
                    GlobInstruction::MatchGlobStar { terminal } => {
                        if terminal {
                            // If we find a terminal globstar, we are done! this must match
                            return true;
                        }
                        // If we see a `/` then we need to consider ending the globstar.
                        if byte == b'/' {
                            next.add(ip + 1);
                        } else if n_threads == 1 {
                        }
                        // but even so we should keep trying to match, just like a fork.
                        next.add(ip);
                    }
                    GlobInstruction::MatchClass(set_index) => {
                        if self.range_sets[set_index as usize].contains(byte) {
                            next.add(ip + 1);
                        }
                    }
                    GlobInstruction::Jump(offset) => {
                        // Push another thread onto the current list
                        if cur.add(offset + ip) {
                            n_threads += 1;
                        }
                    }
                    GlobInstruction::Fork(offset) => {
                        let added1 = cur.add(ip + 1);
                        let added2 = cur.add((offset + (ip as i16)) as u16);
                        if added1 || added2 {
                            n_threads = cur.n;
                        }
                    }
                    GlobInstruction::Match => {
                        // We ran out of instructions while we still have characters
                        // so this thread dies
                    }
                }
                thread_index += 1;
            }
            if next.n == 0 {
                // This means that all threads exited early.  This isn't needed for correctness,
                // but there is no point iterating the rest of the characters.
                return false;
            }
            // We have some progress! clear current and swap the two lists to advance to the next
            // character.
            cur.clear();
            std::mem::swap(&mut cur, &mut next);
        }
        // If we get here we have matched a prefix of the instructions and run out of text.
        // So in prefix mode we are done, otherwise we need to check if we hit the end of the
        // isntructions
        if prefix {
            return true;
        }

        // We matched if there is some path from any current thread to the end, so we need to
        // process all jumps and forks
        let mut i = 0;
        while i < cur.n {
            let ip = cur.get(i);
            match self.instructions[ip as usize] {
                GlobInstruction::Jump(offset) => {
                    // Push another thread onto the current list
                    cur.add(offset + ip);
                }
                GlobInstruction::Fork(offset) => {
                    cur.add(ip + 1);
                    cur.add((offset + (ip as i16)) as u16);
                }
                GlobInstruction::Match => {
                    return true;
                }
                _ => {
                    //ignore
                }
            }
            i += 1;
        }
        false
    }
}

// Consider a more compact encoding.
#[derive(Debug, PartialEq, Eq, Clone, Copy)]
enum GlobInstruction {
    // Matches a single literal byte, stores if there is a following literal
    MatchLiteral((u8, bool)),
    // Matches any non-`/` character
    MatchAnyNonDelim,
    // Matches **, which is any character but can only 'end' on a `/` or end of string
    MatchGlobStar { terminal: bool },
    // Matches any character in the set
    // The value is an index into the ranges
    MatchClass(u8),
    // Unconditional jump forward. This would occur at the end of an alternate to jump past the
    // other alternates.
    Jump(u16),
    // Splits control flow into two branches.
    // Represented as a signed integer since we allow backwards forks
    Fork(i16),
    // End of program
    Match,
}

#[derive(Debug, Eq, PartialEq)]
enum GlobToken {
    // A sequence of bytes, possibly including `/` characters
    // all bytes are unescaped.
    Literal(u8),
    // a `*` token
    Star,
    // a `**` token
    GlobStar,
    // A  `?` token`
    QuestionMark,
    // a `[` token
    LSquareBracket,
    // a `]` token
    RSquareBracket,
    // a `{` token
    LBracket,
    // a `}` token
    RBracket,
    // a `,` token
    Comma,
    // a `-` token
    Hyphen,
    End,
}
impl Display for GlobToken {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        if let GlobToken::Literal(c) = self {
            let s = c.to_string();
            f.write_str(&s)
        } else {
            f.write_str(match self {
                GlobToken::Star => "*",
                GlobToken::GlobStar => "**",
                GlobToken::QuestionMark => "?",
                GlobToken::LSquareBracket => "[",
                GlobToken::RSquareBracket => "]",
                GlobToken::LBracket => "{",
                GlobToken::RBracket => "}",
                GlobToken::Comma => ",",
                GlobToken::Hyphen => "-",
                GlobToken::End => "<END>",
                GlobToken::Literal(_) => panic!("impossible"),
            })
        }
    }
}

struct Tokenizer<'a> {
    input: &'a [u8],
    pos: usize,
    err: Option<anyhow::Error>,
    bracket_count: u32,
    square_bracket_count: u32,
}

impl<'a> Tokenizer<'a> {
    fn new(input: &'a str) -> Tokenizer<'a> {
        Self {
            input: input.as_bytes(),
            pos: 0,
            err: None,
            bracket_count: 0,
            square_bracket_count: 0,
        }
    }
    fn next_token(&mut self) -> GlobToken {
        match self.input.get(self.pos) {
            None => GlobToken::End,
            Some(c) => {
                self.pos += 1;
                match c {
                    b'*' if self.square_bracket_count == 0 => match self.input.get(self.pos) {
                        Some(b) if *b == b'*' => {
                            // TODO: we should validate that the previous character was a `/` as
                            // well
                            self.pos += 1;
                            match self.input.get(self.pos) {
                                None => {}
                                Some(b'/') => {
                                    self.pos += 1;
                                } // ok if we are at the end or followed by a `/`
                                _ => {
                                    self.err = Some(anyhow!(
                                        "a glob star must be a full path segment, e.g. `/**/`"
                                    ));
                                    return GlobToken::End;
                                }
                            }

                            GlobToken::GlobStar
                        }
                        _ => GlobToken::Star,
                    },
                    b'?' if self.square_bracket_count == 0 => GlobToken::QuestionMark,
                    b'[' => {
                        self.square_bracket_count += 1;
                        GlobToken::LSquareBracket
                    }
                    b']' => {
                        if self.square_bracket_count == 0 {
                            self.err = Some(anyhow!(
                                "mismatched square brackets at {} in glob",
                                self.pos
                            ));
                            return GlobToken::End;
                        }
                        self.square_bracket_count -= 1;
                        GlobToken::RSquareBracket
                    }
                    // These are not tokens inside of a character class, they are just literals
                    b'{' if self.square_bracket_count == 0 => {
                        self.bracket_count += 1;
                        GlobToken::LBracket
                    }
                    b'}' if self.square_bracket_count == 0 => {
                        if self.bracket_count == 0 {
                            self.err = Some(anyhow!("mismatched brackets at {} in glob", self.pos));
                            return GlobToken::End;
                        }

                        self.bracket_count -= 1;
                        GlobToken::RBracket
                    }
                    // This is only a meaninful token inside of a character class
                    b'-' if self.square_bracket_count > 0 => GlobToken::Hyphen,
                    // This is only meaningful inside of an alternation (aka brackets)
                    b',' if self.bracket_count > 0 => GlobToken::Comma,
                    cur => {
                        if *cur == b'\\' {
                            match self.input.get(self.pos) {
                                Some(c) => {
                                    self.pos += 1;
                                    GlobToken::Literal(*c)
                                }
                                None => {
                                    self.err = Some(anyhow!("found `\\` character at end of glob"));
                                    GlobToken::End
                                }
                            }
                        } else {
                            GlobToken::Literal(*cur)
                        }
                    }
                }
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
        match_in_directory: bool,
    ) -> GlobPartMatchesIterator<'a> {
        GlobPartMatchesIterator {
            path,
            part: self,
            match_in_directory,
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

                // TODO(lukes): there shouldn't be a need to traverse graphemes here, just literal
                // matches since all of our delimiters are ascii characters
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
    match_in_directory: bool,
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
                        self.match_in_directory,
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

    use super::{Glob, GlobToken, Tokenizer};
    use crate::glob::GlobProgram;

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
        let parsed = Glob::parse(glob).unwrap();

        println!("{glob:?} compiled to {parsed:?} matching {path}");

        assert!(parsed.execute(path));

        let parsed2 = GlobProgram::compile(glob).unwrap();
        println!("{glob:?} compiled to\n{parsed2:#?}\nmatching {path}");
        let prefix = path.ends_with('/');

        assert!(parsed2.matches(path, prefix));
    }

    #[rstest]
    #[case::early_end("*.raw", "hello.raw.js")]
    #[case::early_end(
        "**/next/dist/esm/*.shared-runtime.js",
        "next/dist/shared/lib/app-router-context.shared-runtime.js"
    )]
    fn glob_not_matching(#[case] glob: &str, #[case] path: &str) {
        let parsed = Glob::parse(glob).unwrap();

        println!("{glob:?} compiled to {parsed:?} matching {path}");

        assert!(!parsed.execute(path));

        let parsed2 = GlobProgram::compile(glob).unwrap();
        println!("{glob:?} compiled to {parsed2:?} matching {path}");
        let prefix = path.ends_with('/');

        assert!(!parsed2.matches(path, prefix));
    }

    #[test]
    fn test_tokenizer() {
        let mut tok = Tokenizer::new("foo/bar[a-z]/?/**");
        let prefix: Vec<GlobToken> = "foo/bar".bytes().map(|c| GlobToken::Literal(c)).collect();
        for t in prefix {
            assert_eq!(t, tok.next_token());
        }
        assert_eq!(GlobToken::LSquareBracket, tok.next_token());
        assert_eq!(GlobToken::Literal(b'a'), tok.next_token());
        assert_eq!(GlobToken::Hyphen, tok.next_token());
        assert_eq!(GlobToken::Literal(b'z'), tok.next_token());
        assert_eq!(GlobToken::RSquareBracket, tok.next_token());
        assert_eq!(GlobToken::Literal(b'/'), tok.next_token());
        assert_eq!(GlobToken::QuestionMark, tok.next_token());
        assert_eq!(GlobToken::Literal(b'/'), tok.next_token());
        assert_eq!(GlobToken::GlobStar, tok.next_token());
        assert_eq!(GlobToken::End, tok.next_token());
    }
}
