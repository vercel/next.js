use std::{cmp::Ordering, fmt::Display};

use anyhow::{anyhow, bail, Context, Result};
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

#[turbo_tasks::value]
#[derive(Debug, Clone)]
pub struct Glob {
    #[turbo_tasks(trace_ignore)]
    program: GlobProgram,
}

impl Glob {
    pub fn execute(&self, path: &str) -> bool {
        // TODO(lukesandberg): deprecate this implicit behavior
        let match_partial = path.ends_with('/');
        let path = if match_partial {
            &path[0..path.len() - 1]
        } else {
            path
        };
        self.program.matches(path, match_partial)
    }

    // Returns true if the glob could match a filename underneath this `path` where the path
    // represents a directory.
    pub fn match_in_directory(&self, path: &str) -> bool {
        self.program.matches(path, true)
    }

    pub fn parse(input: &str) -> Result<Self> {
        Ok(Self {
            program: GlobProgram::compile(input)?,
        })
    }
}

impl TryFrom<&str> for Glob {
    type Error = anyhow::Error;

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        Glob::parse(value)
    }
}
impl TryFrom<RcStr> for Glob {
    type Error = anyhow::Error;

    fn try_from(value: RcStr) -> Result<Self, Self::Error> {
        Glob::parse(value.as_str())
    }
}

#[turbo_tasks::value_impl]
impl Glob {
    #[turbo_tasks::function]
    pub fn new(glob: RcStr) -> Result<Vc<Self>> {
        Ok(Self::cell(Glob::try_from(glob)?))
    }
}

#[derive(Debug, Eq, PartialEq, Copy, Clone, Serialize, Deserialize, Hash)]
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

#[derive(Debug, Eq, Clone, PartialEq, Hash, Serialize, Deserialize)]
struct RangeSet {
    ranges: Box<[ByteRange]>,
}

impl RangeSet {
    fn new(mut ranges: Vec<ByteRange>) -> RangeSet {
        ranges.sort();
        ranges.dedup_by(|a, b| {
            if b.high >= a.low {
                b.high = a.high;
                true
            } else {
                false
            }
        });
        Self {
            ranges: ranges.into_boxed_slice(),
        }
    }

    fn contains(&self, b: u8) -> bool {
        self.ranges
            .binary_search_by(move |r| {
                if r.low <= b {
                    if r.high >= b {
                        Ordering::Equal
                    } else {
                        Ordering::Less
                    }
                } else {
                    Ordering::Greater
                }
            })
            .is_ok()
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

#[derive(Debug, PartialEq, Eq, Hash, Clone, Serialize, Deserialize)]
struct BitSet {
    bits: Box<[u64]>, // use a boxed slice instead of a vec since this is not extendable
}
impl BitSet {
    const BITS: usize = { u64::BITS as usize };
    fn new(len: usize) -> Self {
        let words = len.div_ceil(Self::BITS);
        Self {
            bits: vec![0u64; words].into_boxed_slice(),
        }
    }
    fn set(&mut self, bit: usize) {
        let word_index = bit / Self::BITS;
        let bit_index = bit % Self::BITS;

        self.bits[word_index] |= 1 << bit_index;
    }
    fn has(&self, bit: usize) -> bool {
        let word_index = bit / Self::BITS;
        let bit_index = bit % Self::BITS;
        self.bits[word_index] & 1 << bit_index != 0
    }
}

#[derive(Debug, PartialEq, Eq, Hash, Clone, Serialize, Deserialize)]
pub struct GlobProgram {
    instructions: Box<[GlobInstruction]>,
    // Instructions we can end on that are a valid match
    match_instructions: BitSet,
    // Instructions we can end on that are a valid prefix match
    prefix_match_instructions: BitSet,
    range_sets: Box<[RangeSet]>,
}

impl GlobProgram {
    fn compile(pattern: &str) -> Result<GlobProgram> {
        GlobProgram::do_compile(pattern).with_context(|| format!("Failed to parse glob: {pattern}"))
    }
    fn do_compile(pattern: &str) -> Result<GlobProgram> {
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
            let (pos, t) = tok.next_token();
            match t {
                GlobToken::Caret | GlobToken::ExclamationPoint => {
                    panic!("these cannot appear at the beginning of a pattern")
                }
                GlobToken::Literal(lit) => {
                    instructions.push(GlobInstruction::MatchLiteral(lit));
                }
                GlobToken::Star => {
                    instructions.push(GlobInstruction::Fork(3)); // allowed to match nothing
                    instructions.push(GlobInstruction::MatchAnyNonDelim);
                    // After a star match we either loop back to try again, or proceed.
                    instructions.push(GlobInstruction::Fork(-1));
                }
                GlobToken::GlobStar => {
                    // allow globstars to match nothing by skipping it
                    instructions.push(GlobInstruction::Fork(2));
                    // We don't actually know if it is terminal or not yet.  We will determine
                    // this after code generation.
                    instructions.push(GlobInstruction::MatchGlobStar { terminal: false });
                }
                GlobToken::QuestionMark => {
                    // A question match, optionally matches a non-delimiter character, so we either
                    // skip forward or not.
                    instructions.push(GlobInstruction::Fork(2));
                    instructions.push(GlobInstruction::MatchAnyNonDelim);
                }
                GlobToken::LSquareBracket => {
                    let mut set = Vec::new();
                    // with in a square bracket we expect a mix of literals and hyphens followed by
                    // a RSuareBracket
                    let mut prev_literal: Option<u8> = None;
                    let mut partial_range: Option<u8> = None;
                    let mut negated = false;
                    loop {
                        let (pos, t) = tok.next_token();
                        match t {
                            GlobToken::Caret | GlobToken::ExclamationPoint => {
                                if !set.is_empty()
                                    || prev_literal.is_some()
                                    || partial_range.is_some()
                                {
                                    bail!(
                                        "negation tokens can only appear at the beginning of \
                                         character classes @{pos}"
                                    );
                                }
                                negated = !negated;
                            }
                            GlobToken::Literal(lit) => {
                                if lit > 127 {
                                    // TODO(lukesandberg): These are supportable by expanding into
                                    // several RanngeSets for each byte in the multibyte characters
                                    // However, this is very unlikely to be required by a user so
                                    // for now the feature is omitted.
                                    bail!("Unsupported non-ascii character in set @{pos}");
                                }
                                if let Some(start) = partial_range {
                                    set.push(ByteRange::range(start, lit));
                                    partial_range = None;
                                } else {
                                    if let Some(prev) = prev_literal {
                                        set.push(ByteRange::singleton(prev));
                                    }
                                    prev_literal = Some(lit);
                                }
                            }
                            GlobToken::Hyphen => {
                                if let Some(lit) = prev_literal {
                                    prev_literal = None;
                                    partial_range = Some(lit);
                                } else {
                                    bail!(
                                        "Unexpected hyphen at the beginning of a character class \
                                         @{pos}"
                                    )
                                }
                            }

                            GlobToken::RSquareBracket => {
                                if let Some(lit) = prev_literal {
                                    set.push(ByteRange::singleton(lit));
                                }
                                if partial_range.is_some() {
                                    bail!(
                                        "unexpected hyphen at the end of a character class @{pos}"
                                    )
                                }
                                let set = RangeSet::new(set);
                                let index: u8 = range_sets.len().try_into().with_context(|| {
                                    format!("Cannot have more than 255 range sets @{pos}")
                                })?;
                                range_sets.push(set);
                                // It is more efficient to use a separate instruction than pad out
                                // the range class
                                if negated {
                                    instructions.push(GlobInstruction::NegativeMatchClass(index))
                                } else {
                                    instructions.push(GlobInstruction::MatchClass(index));
                                }
                                break;
                            }
                            _ => {
                                bail!("Unexpected token {t} inside of character class @{pos}");
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
                    {
                        let pending = left_bracket_starts.last_mut().unwrap();
                        // for an alternation we either 'jump' past it to the next one, or we
                        // process it directly

                        let mut branch = Vec::new();
                        std::mem::swap(&mut instructions, &mut branch);
                        pending.branches.push(branch);
                    }

                    // If we hit a `}` then we are done so compute the jumps and pop the prefix.
                    if t == GlobToken::RBracket {
                        let mut branches = left_bracket_starts.pop().unwrap();
                        let prefix = &mut branches.prefix;
                        let branches = &mut branches.branches;

                        let num_branches = branches.len();
                        if num_branches <= 1 {
                            bail!(
                                "Cannot have an alternation with less than 2 members, remove the \
                                 brackets? @{pos}"
                            );
                        }
                        let mut next_branch_offset = num_branches - 1;
                        for branch in &branches[0..num_branches - 1] {
                            // to jump past the branch we need to jump past all its instructions
                            // +1 to account for the JUMP
                            // instruction at the end
                            next_branch_offset += branch.len() + 1;
                            prefix.push(GlobInstruction::Fork(
                                next_branch_offset.try_into().with_context(|| {
                                    format!(
                                        "glob too large, cannot have more than 32K instructions  \
                                         @{pos}"
                                    )
                                })?,
                            ));
                            next_branch_offset -= 1; // subtract one since we added a fork
                                                     // instruction.
                        }
                        let mut end_of_alternation =
                            next_branch_offset + branches.last().unwrap().len();
                        for branch in &mut branches[0..num_branches - 1] {
                            end_of_alternation -= branch.len(); // from the end of this branch, this is how far it is to the end of
                                                                // the
                                                                // alternation
                            prefix.append(branch);
                            prefix.push(GlobInstruction::Jump(
                                end_of_alternation.try_into().with_context(|| {
                                    format!(
                                        "glob too large, cannot have more than 32K instructions  \
                                         @{pos}"
                                    )
                                })?,
                            ));
                            end_of_alternation -= 1; // account for the jump instruction
                        }
                        end_of_alternation -= branches.last().unwrap().len();
                        prefix.append(branches.last_mut().unwrap());
                        debug_assert!(end_of_alternation == 0);

                        std::mem::swap(&mut instructions, prefix);
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
        // matches. The issue is that if we are executing a globstar when the program
        // completes then pass or fail is dependant upon whether there are any unconditional
        // required subsequent matches e.g. `foo/**` matches `foo/bar/baz.js` but foo/**/a`
        // does not, because we have to match that 'a' similarly `foo/{**,bar}` matches
        // `foo/bar/baz.js`. To determine this we need to chase pointers from globstars to the
        // end of the program, and if there is a path to match then it is a terminal globstar.
        // Similarly for other matches (branches, stars) we might end a match on some control flow
        // rather than following it to the end we can just precompute properties of each
        // instructions

        if instructions.len() > u16::MAX as usize {
            bail!("program too large");
        }

        let mut visited = BitSet::new(instructions.len());
        let mut has_path_to_match = BitSet::new(instructions.len());
        let mut has_path_to_prefix_match = BitSet::new(instructions.len());

        for start in (0..instructions.len()).rev() {
            visited.set(start);
            let (valid_prefix_end, valid_match) = match instructions[start] {
                GlobInstruction::MatchLiteral(byte) => (byte == b'/', false),
                GlobInstruction::MatchAnyNonDelim => (false, false),
                GlobInstruction::MatchGlobStar { terminal } => {
                    debug_assert!(!terminal); // shouldn't have been set
                                              // a globstar is always a valid prefix end but is only a valid match if the
                                              // subsequent instruction is.
                    let next = start + 1;
                    debug_assert!(visited.has(next), "should have already visited the target");
                    let has_path_to_end = has_path_to_match.has(next);
                    if has_path_to_end {
                        instructions[start] = GlobInstruction::MatchGlobStar { terminal: true };
                    }
                    (true, has_path_to_match.has(next))
                }
                GlobInstruction::MatchClass(index) => {
                    (range_sets[index as usize].contains(b'/'), false)
                }
                GlobInstruction::NegativeMatchClass(index) => {
                    (!range_sets[index as usize].contains(b'/'), false)
                }
                GlobInstruction::Jump(offset) => {
                    let target = start + offset as usize;
                    debug_assert!(
                        visited.has(target),
                        "should have already visited the target"
                    );
                    // copy from the target
                    (
                        has_path_to_prefix_match.has(target),
                        has_path_to_match.has(target),
                    )
                }
                GlobInstruction::Fork(offset) => {
                    let next_instruction = start + 1;
                    debug_assert!(
                        visited.has(next_instruction),
                        "should have already visited the target"
                    );
                    let next = (
                        has_path_to_prefix_match.has(next_instruction),
                        has_path_to_match.has(next_instruction),
                    );

                    if offset < 0 {
                        // Forks that point backwards are implementing loops.
                        // So we don't need to follow them now
                        next
                    } else {
                        let fork_target = start + offset as usize;
                        debug_assert!(
                            visited.has(fork_target),
                            "should have already visited the target"
                        );
                        let fork = (
                            has_path_to_prefix_match.has(fork_target),
                            has_path_to_match.has(fork_target),
                        );
                        (next.0 || fork.0, next.1 || fork.1)
                    }
                }
                GlobInstruction::Match => {
                    // For prefix matches, we only want to say it matches if a a file within the
                    // directory could match, so if we see a Maatch instruction then we cannot match
                    // it with this glob
                    (false, true)
                }
            };
            if valid_prefix_end {
                has_path_to_prefix_match.set(start)
            }
            if valid_match {
                has_path_to_match.set(start)
            }
        }

        Ok(GlobProgram {
            instructions: instructions.into_boxed_slice(),
            match_instructions: has_path_to_match,
            prefix_match_instructions: has_path_to_prefix_match,
            range_sets: range_sets.into_boxed_slice(),
        })
    }

    fn matches(&self, v: &str, prefix: bool) -> bool {
        let len = self.instructions.len();
        // Use a single uninitialized allocation for our storage.
        let mut storage: Vec<u16> =
            unsafe { std::mem::transmute(vec![std::mem::MaybeUninit::<u16>::uninit(); len * 4]) };
        let (set1, set2) = storage.split_at_mut(len * 2);
        let mut set1 = SparseSet::from_storage(set1);
        let mut set2 = SparseSet::from_storage(set2);
        // Access via references to make the swap operations cheaper.
        let mut cur = &mut set1;
        let mut next = &mut set2;
        // start at the first instruction!
        cur.add(0);
        // Process all bytes in order
        // Each iteration of the outer loop advances one byte through the input
        // Each iteration of the inner loop iterates at most once for every instruction in the
        // program but typically far less
        // This bounds execution at O(N*M) where N is the size of the path and M is the size of the
        // program
        let mut n_threads = 1;
        let mut ip = 0;
        'outer: for &byte in v.as_bytes() {
            let mut thread_index = 0;
            // We manage the loop manually at the bottom to make it easier to skip it when hitting
            // some fast paths
            loop {
                match self.instructions[ip as usize] {
                    GlobInstruction::MatchLiteral(m) => {
                        if byte == m {
                            if n_threads == 1 {
                                cur.clear();
                                ip += 1;
                                cur.add(ip);
                                continue 'outer;
                            }
                            // We matched, proceed to the next character
                            next.add(ip + 1);
                        }
                    }
                    GlobInstruction::MatchAnyNonDelim => {
                        if byte != b'/' {
                            if n_threads == 1 {
                                cur.clear();
                                ip += 1;
                                cur.add(ip);
                                continue 'outer;
                            }
                            next.add(ip + 1);
                        }
                    }
                    GlobInstruction::MatchGlobStar { terminal } => {
                        if terminal {
                            // If we find a terminal globstar, we are done! this must match whatever
                            // remains
                            return true;
                        }
                        // If we see a `/` then we need to consider ending the globstar.
                        if byte == b'/' {
                            next.add(ip + 1);
                            // but even so we should keep trying to match, just like a fork.
                            next.add(ip);
                        } else {
                            if n_threads == 1 {
                                continue 'outer;
                            }
                            next.add(ip);
                        }
                    }
                    GlobInstruction::MatchClass(index) => {
                        if self.range_sets[index as usize].contains(byte) {
                            if n_threads == 1 {
                                cur.clear();
                                ip += 1;
                                cur.add(ip);
                                continue 'outer;
                            }
                            next.add(ip + 1);
                        }
                    }
                    GlobInstruction::NegativeMatchClass(index) => {
                        if !self.range_sets[index as usize].contains(byte) {
                            if n_threads == 1 {
                                cur.clear();
                                ip += 1;
                                cur.add(ip);
                                continue 'outer;
                            }
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
                        if cur.add(ip + 1) {
                            n_threads += 1;
                        }
                        if cur.add((offset + (ip as i16)) as u16) {
                            n_threads += 1;
                        }
                    }
                    GlobInstruction::Match => {
                        // We ran out of instructions while we still have characters
                        // so this thread dies
                    }
                }
                // Do this at the bottom of the loop
                thread_index += 1;
                if thread_index < n_threads {
                    ip = cur.get(thread_index);
                } else {
                    break;
                }
            }
            n_threads = next.n;
            if n_threads == 0 {
                // This means that all threads exited early.  This isn't needed for correctness,
                // but there is no point iterating the rest of the characters.
                return false;
            }
            ip = next.get(0);
            // We have some progress! clear current and swap the two lists to advance to the next
            // character.
            cur.clear();
            std::mem::swap(&mut cur, &mut next);
        }
        // If we get here we have matched a prefix of the instructions and run out of text.
        // We need to ensure that whatever instructions we landed on are valid for a prefix match
        if prefix {
            for i in 0..cur.n {
                let insn = cur.get(i);
                if self.prefix_match_instructions.has(insn as usize) {
                    return true;
                }
            }
        }

        // We matched if there is some path from any current thread to the end, so we need to
        // process all jumps and forks
        // Consider a pattern like `a{b,c}` matching `ab`
        // The program would be `Lit(a)Fork(2)Lit(b)Jump(2)Lit(c)Match`
        // So when matching 'b' we need to execute a jump to find the match.`
        for i in 0..cur.n {
            let insn = cur.get(i);
            if self.match_instructions.has(insn as usize) {
                return true;
            }
        }
        false
    }
}

// Consider a more compact encoding.
// The jump offsets force this to 4 bytes
// A variable length instruction encoding would help a lot
#[derive(Debug, PartialEq, Eq, Hash, Clone, Copy, Serialize, Deserialize)]
enum GlobInstruction {
    // Matches a single literal byte
    MatchLiteral(u8),
    // Matches any non-`/` character
    MatchAnyNonDelim,
    // Matches **, which is any character but can only 'end' on a `/` or end of string
    MatchGlobStar { terminal: bool },
    // Matches any character in the set
    // The value is an index into the ranges
    MatchClass(u8),
    // Matches any character not in the set
    // The value is an index into the ranges
    NegativeMatchClass(u8),
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
    // a `,` token, this is contextual, only present within a `{...}` section
    Comma,
    // a `-` token, this is contextual, only present within a `[...]` section
    Hyphen,
    // a ! token, this is contextual, only allowed at the beginning of a `[` or at the very
    // beginning of the pattern
    ExclamationPoint,
    // a '^' token. Same rules as !
    Caret,
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
                GlobToken::ExclamationPoint => "!",
                GlobToken::Caret => "^",
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
    fn next_token(&mut self) -> (usize, GlobToken) {
        (self.pos, self.do_next_token())
    }
    fn do_next_token(&mut self) -> GlobToken {
        match self.input.get(self.pos) {
            None => GlobToken::End,
            Some(c) => {
                self.pos += 1;
                match c {
                    b'*' if self.square_bracket_count == 0 => match self.input.get(self.pos) {
                        Some(b) if *b == b'*' => {
                            // This is a globstar

                            if self.pos > 2 && self.input[self.pos - 2] != b'/' {
                                self.err = Some(anyhow!(
                                    "a glob star must be a full path segment, e.g. `/**/` @{}",
                                    self.pos
                                ));
                                return GlobToken::End;
                            }
                            self.pos += 1;
                            match self.input.get(self.pos) {
                                None => {}
                                Some(b'/') => {
                                    self.pos += 1;
                                } // ok if we are at the end or followed by a `/`
                                _ => {
                                    self.err = Some(anyhow!(
                                        "a glob star must be a full path segment, e.g. `/**/`@{}",
                                        self.pos
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
                            self.err =
                                Some(anyhow!("mismatched square brackets in glob @{}", self.pos));
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
                            self.err = Some(anyhow!("mismatched brackets @{}", self.pos));
                            return GlobToken::End;
                        }

                        self.bracket_count -= 1;
                        GlobToken::RBracket
                    }
                    // This is only a meaninful token inside of a character class
                    b'-' if self.square_bracket_count > 0 => GlobToken::Hyphen,
                    // This is only meaningful inside of an alternation (aka brackets)
                    b',' if self.bracket_count > 0 => GlobToken::Comma,
                    // only valid inside of a character class
                    b'!' if self.square_bracket_count > 0 => GlobToken::ExclamationPoint,
                    b'^' if self.square_bracket_count > 0 => GlobToken::Caret,
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

#[cfg(test)]
mod tests {
    use rstest::*;

    use super::{Glob, GlobToken};
    use crate::glob::Tokenizer;

    #[rstest]
    #[case::file("file.js", "file.js")]
    #[case::dir_and_file("../public/äöüščří.png", "../public/äöüščří.png")]
    #[case::dir_and_file("dir/file.js", "dir/file.js")]
    #[case::dir_and_file_partial("dir/file.js", "dir/")]
    #[case::file_braces("file.{ts,js}", "file.js")]
    #[case::dir_and_file_braces("dir/file.{ts,js}", "dir/file.js")]
    #[case::dir_and_file_dir_braces("{dir,other}/file.{ts,js}", "dir/file.js")]
    #[case::star("*.js", "file.js")]
    #[case::star_empty("*.js", ".js")] // can match nothing
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
    }

    #[test]
    fn glob_character_classes() {
        let parsed = Glob::parse("[a-zA-Z0-9_\\-]").unwrap();

        assert!(parsed.execute("a"));
        assert!(!parsed.execute("$"));
        let parsed = Glob::parse("[!a-zA-Z0-9_\\-]").unwrap();

        assert!(!parsed.execute("a"));
        assert!(parsed.execute("$"));
    }

    #[test]
    fn test_tokenizer() {
        let mut tok = Tokenizer::new("foo/bar[a-z]/?/**");
        let prefix: Vec<GlobToken> = "foo/bar".bytes().map(GlobToken::Literal).collect();
        for t in prefix {
            assert_eq!(t, tok.next_token().1);
        }
        assert_eq!(GlobToken::LSquareBracket, tok.next_token().1);
        assert_eq!(GlobToken::Literal(b'a'), tok.next_token().1);
        assert_eq!(GlobToken::Hyphen, tok.next_token().1);
        assert_eq!(GlobToken::Literal(b'z'), tok.next_token().1);
        assert_eq!(GlobToken::RSquareBracket, tok.next_token().1);
        assert_eq!(GlobToken::Literal(b'/'), tok.next_token().1);
        assert_eq!(GlobToken::QuestionMark, tok.next_token().1);
        assert_eq!(GlobToken::Literal(b'/'), tok.next_token().1);
        assert_eq!(GlobToken::GlobStar, tok.next_token().1);
        assert_eq!(GlobToken::End, tok.next_token().1);
    }
}
