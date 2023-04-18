use std::{ops::Range, path::is_separator};

#[derive(Clone, Copy, Debug, Default)]
struct State {
  // These store character indices into the glob and path strings.
  path_index: usize,
  glob_index: usize,

  // The current index into the captures list.
  capture_index: usize,

  // When we hit a * or **, we store the state for backtracking.
  wildcard: Wildcard,
  globstar: Wildcard,
}

#[derive(Clone, Copy, Debug, Default)]
struct Wildcard {
  // Using u32 rather than usize for these results in 10% faster performance.
  glob_index: u32,
  path_index: u32,
  capture_index: u32,
}

type Capture = Range<usize>;

pub fn glob_match(glob: &str, path: &str) -> bool {
  glob_match_internal(glob, path, None)
}

pub fn glob_match_with_captures<'a>(glob: &str, path: &'a str) -> Option<Vec<Capture>> {
  let mut captures = Vec::new();
  if glob_match_internal(glob, path, Some(&mut captures)) {
    return Some(captures);
  }
  None
}

/// This algorithm is based on https://research.swtch.com/glob
fn glob_match_internal<'a>(
  glob_str: &str,
  path_str: &'a str,
  mut captures: Option<&mut Vec<Capture>>,
) -> bool {
  let glob = glob_str.as_bytes();
  let path = path_str.as_bytes();

  let mut state = State::default();

  // Store the state when we see an opening '{' brace in a stack.
  // Up to 10 nested braces are supported.
  let mut brace_stack = BraceStack::default();

  // First, check if the pattern is negated with a leading '!' character.
  // Multiple negations can occur.
  let mut negated = false;
  while state.glob_index < glob.len() && glob[state.glob_index] == b'!' {
    negated = !negated;
    state.glob_index += 1;
  }

  while state.glob_index < glob.len() || state.path_index < path.len() {
    if state.glob_index < glob.len() {
      match glob[state.glob_index] {
        b'*' => {
          let is_globstar = state.glob_index + 1 < glob.len() && glob[state.glob_index + 1] == b'*';
          if is_globstar {
            // Coalesce multiple ** segments into one.
            state.glob_index = skip_globstars(glob, state.glob_index + 2) - 2;
          }

          // If we are on a different glob index than before, start a new capture.
          // Otherwise, extend the active one.
          if captures.is_some()
            && (captures.as_ref().unwrap().is_empty()
              || state.glob_index != state.wildcard.glob_index as usize)
          {
            state.wildcard.capture_index = state.capture_index as u32;
            state.begin_capture(&mut captures, state.path_index..state.path_index);
          } else {
            state.extend_capture(&mut captures);
          }

          state.wildcard.glob_index = state.glob_index as u32;
          state.wildcard.path_index = state.path_index as u32 + 1;

          // ** allows path separators, whereas * does not.
          // However, ** must be a full path component, i.e. a/**/b not a**b.
          if is_globstar {
            state.glob_index += 2;

            if glob.len() == state.glob_index {
              // A trailing ** segment without a following separator.
              state.globstar = state.wildcard;
            } else if (state.glob_index < 3 || glob[state.glob_index - 3] == b'/')
              && glob[state.glob_index] == b'/'
            {
              // Matched a full /**/ segment. If the last character in the path was a separator,
              // skip the separator in the glob so we search for the next character.
              // In effect, this makes the whole segment optional so that a/**/b matches a/b.
              if state.path_index == 0
                || (state.path_index < path.len()
                  && is_separator(path[state.path_index - 1] as char))
              {
                state.end_capture(&mut captures);
                state.glob_index += 1;
              }

              // The allows_sep flag allows separator characters in ** matches.
              // one is a '/', which prevents a/**/b from matching a/bb.
              state.globstar = state.wildcard;
            }
          } else {
            state.glob_index += 1;
          }

          // If we are in a * segment and hit a separator,
          // either jump back to a previous ** or end the wildcard.
          if state.globstar.path_index != state.wildcard.path_index
            && state.path_index < path.len()
            && is_separator(path[state.path_index] as char)
          {
            // Special case: don't jump back for a / at the end of the glob.
            if state.globstar.path_index > 0 && state.path_index + 1 < path.len() {
              state.glob_index = state.globstar.glob_index as usize;
              state.capture_index = state.globstar.capture_index as usize;
              state.wildcard.glob_index = state.globstar.glob_index;
              state.wildcard.capture_index = state.globstar.capture_index;
            } else {
              state.wildcard.path_index = 0;
            }
          }

          // If the next char is a special brace separator,
          // skip to the end of the braces so we don't try to match it.
          if brace_stack.length > 0
            && state.glob_index < glob.len()
            && matches!(glob[state.glob_index], b',' | b'}')
          {
            if state.skip_braces(glob, &mut captures, false) == BraceState::Invalid {
              // invalid pattern!
              return false;
            }
          }

          continue;
        }
        b'?' if state.path_index < path.len() => {
          if !is_separator(path[state.path_index] as char) {
            state.glob_index += 1;
            let cap = match get_char_slice(path_str, path, &mut state.path_index) {
              Some(c) => c,
              None => return false,
            };
            state.add_char_capture(&mut captures, cap);
            continue;
          }
        }
        b'[' if state.path_index < path.len() => {
          state.glob_index += 1;
          let c = match get_char_slice(path_str, path, &mut state.path_index) {
            Some(c) => c,
            None => return false,
          };

          // Check if the character class is negated.
          let mut negated = false;
          if state.glob_index < glob.len() && matches!(glob[state.glob_index], b'^' | b'!') {
            negated = true;
            state.glob_index += 1;
          }

          // Try each range.
          let mut first = true;
          let mut is_match = false;
          while state.glob_index < glob.len() && (first || glob[state.glob_index] != b']') {
            let low = match get_char_slice(glob_str, glob, &mut state.glob_index) {
              Some(c) => c,
              None => return false,
            };

            // If there is a - and the following character is not ], read the range end character.
            let high = if state.glob_index + 1 < glob.len()
              && glob[state.glob_index] == b'-'
              && glob[state.glob_index + 1] != b']'
            {
              state.glob_index += 1;
              match get_char_slice(glob_str, glob, &mut state.glob_index) {
                Some(c) => c,
                None => return false,
              }
            } else {
              low
            };

            if between(low, high, c) {
              is_match = true;
            }
            first = false;
          }
          if state.glob_index >= glob.len() {
            // invalid pattern!
            return false;
          }
          state.glob_index += 1;
          if is_match != negated {
            state.add_char_capture(&mut captures, c);
            continue;
          }
        }
        b'{' if state.path_index < path.len() => {
          if brace_stack.length as usize >= brace_stack.stack.len() {
            // Invalid pattern! Too many nested braces.
            return false;
          }

          state.end_capture(&mut captures);
          state.begin_capture(&mut captures, state.path_index..state.path_index);

          // Push old state to the stack, and reset current state.
          state = brace_stack.push(&state);
          continue;
        }
        b'}' if brace_stack.length > 0 => {
          // If we hit the end of the braces, we matched the last option.
          brace_stack.longest_brace_match =
            brace_stack.longest_brace_match.max(state.path_index as u32);
          state.glob_index += 1;
          state = brace_stack.pop(&state, &mut captures);
          continue;
        }
        b',' if brace_stack.length > 0 => {
          // If we hit a comma, we matched one of the options!
          // But we still need to check the others in case there is a longer match.
          brace_stack.longest_brace_match =
            brace_stack.longest_brace_match.max(state.path_index as u32);
          state.path_index = brace_stack.last().path_index;
          state.glob_index += 1;
          state.wildcard = Wildcard::default();
          state.globstar = Wildcard::default();
          continue;
        }
        mut c if state.path_index < path.len() => {
          // Match escaped characters as literals.
          if !unescape(&mut c, glob, &mut state.glob_index) {
            // Invalid pattern!
            return false;
          }

          let is_match = if c == b'/' {
            is_separator(path[state.path_index] as char)
          } else {
            path[state.path_index] == c
          };

          if is_match {
            state.end_capture(&mut captures);

            if brace_stack.length > 0 && state.glob_index > 0 && glob[state.glob_index - 1] == b'}'
            {
              brace_stack.longest_brace_match = state.path_index as u32;
              state = brace_stack.pop(&state, &mut captures);
            }
            state.glob_index += 1;
            state.path_index += 1;

            // If this is not a separator, lock in the previous globstar.
            if c != b'/' {
              state.globstar.path_index = 0;
            }
            continue;
          }
        }
        _ => {}
      }
    }

    // If we didn't match, restore state to the previous star pattern.
    if state.wildcard.path_index > 0 && state.wildcard.path_index as usize <= path.len() {
      state.backtrack();
      continue;
    }

    if brace_stack.length > 0 {
      // If in braces, find next option and reset path to index where we saw the '{'
      match state.skip_braces(glob, &mut captures, true) {
        BraceState::Invalid => return false,
        BraceState::Comma => {
          state.path_index = brace_stack.last().path_index;
          continue;
        }
        BraceState::EndBrace => {}
      }

      // Hit the end. Pop the stack.
      // If we matched a previous option, use that.
      if brace_stack.longest_brace_match > 0 {
        state = brace_stack.pop(&state, &mut captures);
        continue;
      } else {
        // Didn't match. Restore state, and check if we need to jump back to a star pattern.
        state = *brace_stack.last();
        brace_stack.length -= 1;
        if let Some(captures) = &mut captures {
          captures.truncate(state.capture_index);
        }
        if state.wildcard.path_index > 0 && state.wildcard.path_index as usize <= path.len() {
          state.backtrack();
          continue;
        }
      }
    }

    return negated;
  }

  if brace_stack.length > 0 && state.glob_index > 0 && glob[state.glob_index - 1] == b'}' {
    brace_stack.longest_brace_match = state.path_index as u32;
    brace_stack.pop(&state, &mut captures);
  }

  !negated
}

/// gets a slice to a unicode grapheme at the given index
/// respecting potential escaped characters
#[cfg(feature = "unic-segment")]
fn get_char_slice<'a>(glob: &str, glob_bytes: &'a [u8], index: &mut usize) -> Option<&'a [u8]> {
  use unic_segment::GraphemeCursor;
  let mut cur = GraphemeCursor::new(*index, glob.len());
  let end = cur
    .next_boundary(glob, 0)
    .unwrap_or_else(|e| panic!("Invalid boundary {:?}", e))
    .unwrap();
  match &glob_bytes[*index..end] {
    [b'\\'] => {
      if unescape(&mut 92, glob_bytes, index) {
        get_char_slice(glob, glob_bytes, index)
      } else {
        None
      }
    }
    slice => {
      *index += slice.len();
      Some(slice)
    }
  }
}

#[cfg(not(feature = "unic-segment"))]
fn get_char_slice(_: &str, glob: &[u8], index: &mut usize) -> Option<u8> {
  let mut high = glob[*index];
  if !unescape(&mut high, glob, index) {
    // Invalid pattern!
    return None;
  }
  *index += 1;
  Some(high)
}

/// checks if the given slice is between low and high by comparing each byte
#[cfg(feature = "unic-segment")]
fn between(low: &[u8], high: &[u8], slice: &[u8]) -> bool {
  if low.len() != high.len() || low.len() != slice.len() {
    false
  } else {
    (0..low.len()).all(|i| low[i] <= slice[i] && slice[i] <= high[i])
  }
}

#[cfg(not(feature = "unic-segment"))]
fn between(low: u8, high: u8, slice: u8) -> bool {
  low <= slice && slice <= high
}

#[inline(always)]
fn unescape(c: &mut u8, glob: &[u8], glob_index: &mut usize) -> bool {
  if *c == b'\\' {
    *glob_index += 1;
    if *glob_index >= glob.len() {
      // Invalid pattern!
      return false;
    }
    *c = match glob[*glob_index] {
      b'a' => b'\x61',
      b'b' => b'\x08',
      b'n' => b'\n',
      b'r' => b'\r',
      b't' => b'\t',
      c => c,
    }
  }
  true
}

#[derive(PartialEq)]
enum BraceState {
  Invalid,
  Comma,
  EndBrace,
}

impl State {
  #[inline(always)]
  fn backtrack(&mut self) {
    self.glob_index = self.wildcard.glob_index as usize;
    self.path_index = self.wildcard.path_index as usize;
    self.capture_index = self.wildcard.capture_index as usize;
  }

  #[inline(always)]
  fn begin_capture(&self, captures: &mut Option<&mut Vec<Capture>>, capture: Capture) {
    if let Some(captures) = captures {
      if self.capture_index < captures.len() {
        captures[self.capture_index] = capture;
      } else {
        captures.push(capture);
      }
    }
  }

  #[inline(always)]
  fn extend_capture(&self, captures: &mut Option<&mut Vec<Capture>>) {
    if let Some(captures) = captures {
      if self.capture_index < captures.len() {
        captures[self.capture_index].end = self.path_index;
      }
    }
  }

  #[inline(always)]
  fn end_capture(&mut self, captures: &mut Option<&mut Vec<Capture>>) {
    if let Some(captures) = captures {
      if self.capture_index < captures.len() {
        self.capture_index += 1;
      }
    }
  }

  /// Adds a capture for a slice of characters. It is expected that path_index has already been
  /// incremented by the length of the slice.
  #[inline(always)]
  #[cfg(feature = "unic-segment")]
  fn add_char_capture(&mut self, captures: &mut Option<&mut Vec<Capture>>, slice: &[u8]) {
    self.end_capture(captures);
    self.begin_capture(captures, self.path_index - slice.len()..self.path_index);
    self.capture_index += 1;
  }

  #[inline(always)]
  #[cfg(not(feature = "unic-segment"))]
  fn add_char_capture(&mut self, captures: &mut Option<&mut Vec<Capture>>, _: u8) {
    self.end_capture(captures);
    self.begin_capture(captures, self.path_index - 1..self.path_index);
    self.capture_index += 1;
  }

  fn skip_braces(
    &mut self,
    glob: &[u8],
    captures: &mut Option<&mut Vec<Capture>>,
    stop_on_comma: bool,
  ) -> BraceState {
    let mut braces = 1;
    let mut in_brackets = false;
    let mut capture_index = self.capture_index + 1;
    while self.glob_index < glob.len() && braces > 0 {
      match glob[self.glob_index] {
        // Skip nested braces.
        b'{' if !in_brackets => braces += 1,
        b'}' if !in_brackets => braces -= 1,
        b',' if stop_on_comma && braces == 1 && !in_brackets => {
          self.glob_index += 1;
          return BraceState::Comma;
        }
        c @ (b'*' | b'?' | b'[') if !in_brackets => {
          if c == b'[' {
            in_brackets = true;
          }
          if let Some(captures) = captures {
            if capture_index < captures.len() {
              captures[capture_index] = self.path_index..self.path_index;
            } else {
              captures.push(self.path_index..self.path_index);
            }
            capture_index += 1;
          }
          if c == b'*' {
            if self.glob_index + 1 < glob.len() && glob[self.glob_index + 1] == b'*' {
              self.glob_index = skip_globstars(glob, self.glob_index + 2) - 2;
              self.glob_index += 1;
            }
          }
        }
        b']' => in_brackets = false,
        b'\\' => {
          self.glob_index += 1;
        }
        _ => {}
      }
      self.glob_index += 1;
    }

    if braces != 0 {
      return BraceState::Invalid;
    }

    BraceState::EndBrace
  }
}

#[inline(always)]
fn skip_globstars(glob: &[u8], mut glob_index: usize) -> usize {
  // Coalesce multiple ** segments into one.
  while glob_index + 3 <= glob.len()
    && unsafe { glob.get_unchecked(glob_index..glob_index + 3) } == b"/**"
  {
    glob_index += 3;
  }
  glob_index
}

struct BraceStack {
  stack: [State; 10],
  length: u32,
  longest_brace_match: u32,
}

impl Default for BraceStack {
  #[inline]
  fn default() -> Self {
    // Manual implementation is faster than the automatically derived one.
    BraceStack {
      stack: [State::default(); 10],
      length: 0,
      longest_brace_match: 0,
    }
  }
}

impl BraceStack {
  #[inline(always)]
  fn push(&mut self, state: &State) -> State {
    // Push old state to the stack, and reset current state.
    self.stack[self.length as usize] = *state;
    self.length += 1;
    State {
      path_index: state.path_index,
      glob_index: state.glob_index + 1,
      capture_index: state.capture_index + 1,
      ..State::default()
    }
  }

  #[inline(always)]
  fn pop(&mut self, state: &State, captures: &mut Option<&mut Vec<Capture>>) -> State {
    self.length -= 1;
    let mut state = State {
      path_index: self.longest_brace_match as usize,
      glob_index: state.glob_index,
      // But restore star state if needed later.
      wildcard: self.stack[self.length as usize].wildcard,
      globstar: self.stack[self.length as usize].globstar,
      capture_index: self.stack[self.length as usize].capture_index,
    };
    if self.length == 0 {
      self.longest_brace_match = 0;
    }
    state.extend_capture(captures);
    if let Some(captures) = captures {
      state.capture_index = captures.len();
    }

    state
  }

  #[inline(always)]
  fn last(&self) -> &State {
    &self.stack[self.length as usize - 1]
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use test_case::test_case;

  #[test_case(&b"\\n"[..], 10)] // new line
  #[test_case(&b"\\a"[..], 97)]
  #[test_case(&b"\\\xf0\x9f\xa7\xa6"[..], 0xf0)]
  fn unescape(bytes: &[u8], expected: u8) {
    let mut curr_byte = bytes[0];
    super::unescape(&mut curr_byte, bytes, &mut 0);
    assert_eq!(curr_byte, expected)
  }

  #[cfg(feature = "unic-segment")]
  #[test_case("[\\!]", 1, Some(&[b'!']), 3)]
  fn get_char_slice(glob: &str, mut index: usize, expected: Option<&[u8]>, expected_index: usize) {
    let actual = super::get_char_slice(glob, glob.as_bytes(), &mut index);
    assert_eq!(actual, expected);
    assert_eq!(index, expected_index);
  }

  #[cfg(feature = "unic-segment")]
  #[test_case("[😀-😆]", "😁" ; "range")]
  #[test_case("a[!c]b", "a🌟b" ; "negated character class")]
  #[test_case("a[^c]b", "a🌟b" ; "negated character class 2")]
  #[test_case("a[^🔥]b", "a🌟b";  "negated character class 3")]
  #[test_case("a[^🌟]b", "abb" ; "negated character class unicode")]
  #[test_case("a🌟b", "a🌟b" ; "unicode")]
  #[test_case("a?", "a🌟" ; "question mark")]
  #[test_case("á*", "ábc" ; "single unicode char with wildcard")]
  #[test_case("*ü*", "düf" ; "wildcard with unicode char and wildcard")]
  #[test_case("?ñ?", "añb" ; "wildcard with unicode char and wildcard 2")]
  #[test_case("[á-é]", "é" ; "unicode char range match")]
  #[test_case("[^á-é]", "f" ; "unicode char range negation match")]
  #[test_case("ü{a,b}", "üa" ; "unicode char with curly braces")]
  #[test_case("ü{a,b,*}", "üab" ; "unicode char with curly braces wildcard")]
  #[test_case("a*ő", "aő" ; "latin letter with wildcard and unicode char")]
  #[test_case("ë?z", "ëöz" ; "unicode char wildcard unicode char")]
  #[test_case("j[ǽ-ǿ]", "jǿ" ; "latin letter with unicode range match")]
  #[test_case("😀*", "😀😃😄" ; "emoji with wildcard")]
  #[test_case("*😂*", "🤣😂😅" ; "wildcard with emoji and wildcard")]
  #[test_case("?😊?", "😇😊😍" ; "wildcard with emoji and wildcard 2")]
  #[test_case("[😎-😔]", "😔" ; "emoji range match")]
  #[test_case("[^😖-😞]", "😟" ; "emoji range negation match")]
  #[test_case("😠{a,b}", "😠a" ; "emoji with curly braces")]
  #[test_case("😡{a,b,*}", "😡ab" ; "emoji with curly braces wildcard")]
  #[test_case("a*😢", "a😢" ; "latin letter with wildcard and emoji")]
  #[test_case("😥?z", "😥😦z" ; "emoji wildcard emoji")]
  #[test_case("j[😧-😪]", "j😪" ; "latin letter with emoji range match")]
  #[test_case("👨‍👩‍👦‍👦*", "👨‍👩‍👦‍👦👨‍👩‍👦‍👦" ; "family emoji with wildcard")]
  #[test_case("*🇬🇧*", "🇬🇧🇬🇧" ; "UK flag with wildcard")]
  #[test_case("?🇳🇴?", "🇳🇴🇳🇴🇳🇴" ; "Norway flag with wildcard")]
  #[test_case("[👨‍👩‍👦‍👦-👩‍👩‍👦‍👦]", "👨‍👩‍👦‍👦" ; "family emoji range match")]
  #[test_case("[^🇮🇪-🇬🇧]", "🇫🇷" ; "flag emoji range negation match")]
  #[test_case("👨‍👩‍👦‍👦{a,b}", "👨‍👩‍👦‍👦a" ; "family emoji with curly braces")]
  #[test_case("🇬🇧{a,b,*}", "🇬🇧a" ; "UK flag with curly braces wildcard")]
  #[test_case("a*🇳🇴", "a🇳🇴" ; "latin letter with wildcard and flag emoji")]
  #[test_case("{🇳🇴,🇬🇧}", "🇳🇴" ; "emoji in curly braces")]
  #[test_case("🇩🇪?z", "🇩🇪🇩🇪z" ; "Germany flag wildcard emoji")]
  #[test_case("j[🇬🇧-🇳🇴]", "j🇬🇧" ; "latin letter with flag emoji range match")]
  fn unicode(glob: &str, path: &str) {
    assert!(
      glob_match(glob, path),
      "`{}` doesn't match `{}`",
      path,
      glob
    );
  }

  #[test_case("abc", "abc")]
  #[test_case("*", "abc")]
  #[test_case("*", "" ; "star with empty string")]
  #[test_case("**", "" ; "globstar with empty string")]
  #[test_case("*c", "abc")]
  #[test_case("a*", "abc")]
  #[test_case("a*", "a" ; "single char with star")]
  #[test_case("*a", "a" ; "star with single char")]
  #[test_case("a*b*c*d*e*", "axbxcxdxe")]
  #[test_case("a*b*c*d*e*", "axbxcxdxexxx")]
  #[test_case("a*b?c*x", "abxbbxdbxebxczzx")]
  #[test_case("a/*/test", "a/foo/test" ; "path with star")]
  #[test_case("a/**/test", "a/foo/test" ; "path with globstar")]
  #[test_case("a/**/test", "a/foo/bar/test")]
  #[test_case("a/**/b/c", "a/foo/bar/b/c")]
  #[test_case("a\\*b", "a*b")]
  #[test_case("[abc]", "a")]
  #[test_case("[abc]", "b")]
  #[test_case("[abc]", "c")]
  #[test_case("x[abc]x", "xax")]
  #[test_case("x[abc]x", "xbx")]
  #[test_case("x[abc]x", "xcx")]
  #[test_case("[?]", "?" ; "question match")]
  #[test_case("[*]", "*" ; "star match")]
  #[test_case("[a-cx]", "a")]
  #[test_case("[a-cx]", "b")]
  #[test_case("[a-cx]", "c")]
  #[test_case("[a-cx]", "x")]
  #[test_case("[^abc]", "d" ; "negated bracket")]
  #[test_case("[!abc]", "d" ; "negated bracket 2")]
  #[test_case("[\\!]", "!")]
  #[test_case("a*b*[cy]*d*e*", "axbxcxdxexxx")]
  #[test_case("a*b*[cy]*d*e*", "axbxyxdxexxx")]
  #[test_case("a*b*[cy]*d*e*", "axbxxxyxdxexxx")]
  #[test_case("test.{jpg,png}", "test.jpg")]
  #[test_case("test.{jpg,png}", "test.png")]
  #[test_case("test.{j*g,p*g}", "test.jpg")]
  #[test_case("test.{j*g,p*g}", "test.jpxxxg")]
  #[test_case("test.{j*g,p*g}", "test.jxg")]
  #[test_case("test.{j*g,j*c}", "test.jnc")]
  #[test_case("test.{jpg,p*g}", "test.png")]
  #[test_case("test.{jpg,p*g}", "test.pxg")]
  #[test_case("test.{jpeg,png}", "test.jpeg")]
  #[test_case("test.{jpeg,png}", "test.png")]
  #[test_case("test.{jp\\,g,png}", "test.jp,g")]
  #[test_case("test/{foo,bar}/baz", "test/foo/baz")]
  #[test_case("test/{foo,bar}/baz", "test/bar/baz" ; "braces with slash")]
  #[test_case("test/{foo*,bar*}/baz", "test/foooooo/baz")]
  #[test_case("test/{foo*,bar*}/baz", "test/barrrrr/baz")]
  #[test_case("test/{*foo,*bar}/baz", "test/xxxxfoo/baz")]
  #[test_case("test/{*foo,*bar}/baz", "test/xxxxbar/baz")]
  #[test_case("test/{foo/**,bar}/baz", "test/bar/baz" ; "globstar in braces")]
  #[test_case("a/{a{a,b},b}", "a/aa")]
  #[test_case("a/{a{a,b},b}", "a/ab")]
  #[test_case("a/{a{a,b},b}", "a/b")]
  #[test_case("a/{b,c[}]*}", "a/b")]
  #[test_case("a/{b,c[}]*}", "a/c}xx")]
  #[test_case(
    "some/**/needle.{js,tsx,mdx,ts,jsx,txt}",
    "some/a/bigger/path/to/the/crazy/needle.txt"
  )]
  #[test_case(
    "some/**/{a,b,c}/**/needle.txt",
    "some/foo/a/bigger/path/to/the/crazy/needle.txt"
  )]
  fn basic(path: &str, glob: &str) {
    assert!(
      glob_match(path, glob),
      "`{}` doesn't match `{}`",
      path,
      glob
    );
  }

  #[test_case("*b", "abc" ; "star with char mismatch")]
  #[test_case("b*", "abc" ; "char with star mismatch")]
  #[test_case("a*b?c*x", "abxbbxdbxebxczzy")]
  #[test_case("a/*/test", "a/foo/bar/test")]
  #[test_case("a\\*b", "axb")]
  #[test_case("[abc]", "d")]
  #[test_case("x[abc]x", "xdx")]
  #[test_case("x[abc]x", "xay")]
  #[test_case("[?]", "a" ; "question mismatch")]
  #[test_case("[*]", "a" ; "star mismatch")]
  #[test_case("[a-cx]", "d")]
  #[test_case("[^abc]", "a" ; "negated bracket mismatch")]
  #[test_case("[^abc]", "b" ; "negated bracket mismatch 2")]
  #[test_case("[^abc]", "c" ; "negated bracket mismatch 3")]
  #[test_case("[!abc]", "a" ; "negated bracket mismatch 4")]
  #[test_case("[!abc]", "b" ; "negated bracket mismatch 5")]
  #[test_case("[!abc]", "c" ; "negated bracket mismatch 6")]
  #[test_case("test.{j*g,p*g}", "test.jnt")]
  #[test_case("test.{jpg,p*g}", "test.pnt")]
  #[test_case("test.{jpeg,png}", "test.jpg")]
  #[test_case("test.{jp\\,g,png}", "test.jxg")]
  #[test_case("test/{foo,bar}/baz", "test/baz/baz")]
  #[test_case("test/{foo/**,bar}/baz", "test/bar/test/baz")]
  #[test_case("*.txt", "some/big/path/to/the/needle.txt")]
  #[test_case("a/{a{a,b},b}", "a/ac")]
  #[test_case("a/{a{a,b},b}", "a/c")]
  #[test_case(
    "some/**/{a,b,c}/**/needle.txt",
    "some/foo/d/bigger/path/to/the/crazy/needle.txt"
  )]
  fn basic_not(glob: &str, path: &str) {
    assert!(!glob_match(glob, path), "`{}` matches `{}`", path, glob);
  }

  // The below tests are based on Bash and micromatch.
  // https://github.com/micromatch/picomatch/blob/master/test/bash.js
  // Converted using the following find and replace regex:
  // find: assert\(([!])?isMatch\('(.*?)', ['"](.*?)['"]\)\);
  // replace: assert!($1glob_match("$3", "$2"));

  #[test_case("a*", "a")]
  #[test_case("a*", "ab")]
  #[test_case("a*", "abc")]
  #[test_case("\\a*", "a" ; "escaped character")]
  #[test_case("\\a*", "abc" ; "escaped character 2")]
  #[test_case("\\a*", "abd")]
  #[test_case("\\a*", "abe")]
  fn bash(glob: &str, path: &str) {
    assert!(
      glob_match(glob, path),
      "`{}` doesn't match `{}`",
      path,
      glob
    );
  }

  #[test_case("a*", "*" ; "wildcard")]
  #[test_case("a*", "**" ; "wildcard 2")]
  #[test_case("a*", "\\*" ; "escaped wildcard")]
  #[test_case("a*", "a/*" ; "wildcard with slash")]
  #[test_case("a*", "b" ; "wildcard missing")]
  #[test_case("a*", "bc")]
  #[test_case("a*", "bcd" ; "wildcard missing 2")]
  #[test_case("a*", "bdir/" ; "wildcard missing 3")]
  #[test_case("a*", "Beware" ; "wildcard missing 4")]
  #[test_case("\\a*", "*" ; "escaped character wildcard")]
  #[test_case("\\a*", "**" ; "escaped character wildcard 2")]
  #[test_case("\\a*", "\\*" ; "escaped character escaped wildcard")]
  #[test_case("\\a*", "a/*" ; "escaped character wildcard with slash")]
  #[test_case("\\a*", "b"; "escaped character wildcard missing")]
  #[test_case("\\a*", "bb")]
  #[test_case("\\a*", "bcd" ; "escaped character wildcard missing 2")]
  #[test_case("\\a*", "bdir/"; "escaped character wildcard missing 3")]
  #[test_case("\\a*", "Beware" ; "escaped character wildcard missing 4")]
  #[test_case("\\a*", "c")]
  #[test_case("\\a*", "ca")]
  #[test_case("\\a*", "cb")]
  #[test_case("\\a*", "d")]
  #[test_case("\\a*", "dd")]
  #[test_case("\\a*", "de")]
  fn bash_not(glob: &str, path: &str) {
    assert!(!glob_match(glob, path), "`{}` matches `{}`", path, glob);
  }

  #[test_case("b*/", "bdir/")]
  fn bash_directories(glob: &str, path: &str) {
    assert!(
      glob_match(glob, path),
      "`{}` doesn't match `{}`",
      path,
      glob
    );
  }

  #[test_case("b*/", "*" ; "b_star_slash_star")]
  #[test_case("b*/", "**" ; "b_star_slash_double_star")]
  #[test_case("b*/", "\\*" ; "b_star_slash_escaped_star")]
  #[test_case("b*/", "a" ; "b_star_slash_a")]
  #[test_case("b*/", "a/*" ; "b_star_slash_a_slash_star")]
  #[test_case("b*/", "abc")]
  #[test_case("b*/", "abd")]
  #[test_case("b*/", "abe")]
  #[test_case("b*/", "b")]
  #[test_case("b*/", "bb")]
  #[test_case("b*/", "bcd")]
  #[test_case("b*/", "Beware")]
  #[test_case("b*/", "c")]
  #[test_case("b*/", "ca")]
  #[test_case("b*/", "cb")]
  #[test_case("b*/", "d")]
  #[test_case("b*/", "dd")]
  #[test_case("b*/", "de")]
  fn bash_directories_not(glob: &str, path: &str) {
    assert!(!glob_match(glob, path), "`{}` matches `{}`", path, glob);
  }

  #[test_case("\\*", "*" ; "escaped star")]
  #[test_case("*q*", "aqa")]
  #[test_case("*q*", "aaqaa")]
  #[test_case("\\**", "*" ; "escaped double star")]
  #[test_case("\\**", "**" ; "escaped double star 2")]
  fn bash_escaping(glob: &str, path: &str) {
    assert!(
      glob_match(glob, path),
      "`{}` doesn't match `{}`",
      path,
      glob
    );
  }

  #[test_case("\\^", "*" ; "escaped caret")]
  #[test_case("\\^", "**" ; "escaped caret 2")]
  #[test_case("\\^", "a" ; "escaped caret 4")]
  #[test_case("\\^", "\\*" ; "escaped caret 3")]
  #[test_case("\\^", "a/*" ; "escaped caret 5")]
  #[test_case("\\^", "abc" ; "escaped caret 6")]
  #[test_case("\\^", "abd" ; "escaped caret 7")]
  #[test_case("\\^", "abe" ; "escaped caret 8")]
  #[test_case("\\^", "b" ; "escaped caret 9")]
  #[test_case("\\^", "bb" ; "escaped caret 10")]
  #[test_case("\\^", "bcd" ; "escaped caret 11")]
  #[test_case("\\^", "bdir/" ; "escaped caret 12")]
  #[test_case("\\^", "Beware" ; "escaped caret 13")]
  #[test_case("\\^", "c" ; "escaped caret 14")]
  #[test_case("\\^", "ca" ; "escaped caret 15")]
  #[test_case("\\^", "cb" ; "escaped caret 16")]
  #[test_case("\\^", "d" ; "escaped caret 17")]
  #[test_case("\\^", "dd" ; "escaped caret 18")]
  #[test_case("\\^", "de" ; "escaped caret 19")]
  // #[test_case("\\*", "\\*")]
  #[test_case("\\*", "**")]
  #[test_case("\\*", "a" ; "escaped star 2")]
  #[test_case("\\*", "a/*" ; "escaped star 3")]
  #[test_case("\\*", "abc")]
  #[test_case("\\*", "abd")]
  #[test_case("\\*", "abe")]
  #[test_case("\\*", "b")]
  #[test_case("\\*", "bb" ; "escaped star 4")]
  #[test_case("\\*", "bcd" ; "escaped star 5")]
  #[test_case("\\*", "bdir/" ; "escaped star 6")]
  #[test_case("\\*", "Beware" ; "escaped star 7")]
  #[test_case("\\*", "c" ; "escaped star 8")]
  #[test_case("\\*", "ca" ; "escaped star 9")]
  #[test_case("\\*", "cb" ; "escaped star 10")]
  #[test_case("\\*", "d" ; "escaped star 11")]
  #[test_case("\\*", "dd" ; "escaped star 12")]
  #[test_case("\\*", "de" ; "escaped star 13")]
  #[test_case("a\\*", "*" ; "escaped character wildcard missing")]
  #[test_case("a\\*", "**" ; "escaped character wildcard missing 2")]
  #[test_case("a\\*", "\\*" ; "escaped character wildcard missing 3")]
  #[test_case("a\\*", "a" ; "escaped character wildcard missing 4")]
  #[test_case("a\\*", "a/*" ; "escaped character wildcard missing 5")]
  #[test_case("a\\*", "abc")]
  #[test_case("a\\*", "abd")]
  #[test_case("a\\*", "abe")]
  #[test_case("a\\*", "b")]
  #[test_case("a\\*", "bb")]
  #[test_case("a\\*", "bcd")]
  #[test_case("a\\*", "bdir/")]
  #[test_case("a\\*", "Beware")]
  #[test_case("a\\*", "c")]
  #[test_case("a\\*", "ca")]
  #[test_case("a\\*", "cb")]
  #[test_case("a\\*", "d")]
  #[test_case("a\\*", "dd")]
  #[test_case("a\\*", "de")]
  #[test_case("*q*", "*" ; "missing character wildcard")]
  #[test_case("*q*", "**" ; "missing character wildcard 2")]
  #[test_case("*q*", "\\*" ; "missing character wildcard 3")]
  #[test_case("*q*", "a" ; "missing character wildcard 4")]
  #[test_case("*q*", "a/*" ; "missing character wildcard 5")]
  #[test_case("*q*", "abc")]
  #[test_case("*q*", "abd")]
  #[test_case("*q*", "abe")]
  #[test_case("*q*", "b")]
  #[test_case("*q*", "bb")]
  #[test_case("*q*", "bcd")]
  #[test_case("*q*", "bdir/")]
  #[test_case("*q*", "Beware")]
  #[test_case("*q*", "c")]
  #[test_case("*q*", "ca")]
  #[test_case("*q*", "cb")]
  #[test_case("*q*", "d")]
  #[test_case("*q*", "dd")]
  #[test_case("*q*", "de")]
  #[test_case("\\**", "\\*" ; "escaped double star missing")]
  #[test_case("\\**", "a" ; "escaped double star missing 2")]
  #[test_case("\\**", "a/*" ; "escaped double star missing 3")]
  #[test_case("\\**", "abc" ; "escaped double star missing 4")]
  #[test_case("\\**", "abd" ; "escaped double star missing 5")]
  #[test_case("\\**", "abe" ; "escaped double star missing 6")]
  #[test_case("\\**", "b" ; "escaped double star missing 7")]
  #[test_case("\\**", "bb")]
  #[test_case("\\**", "bcd")]
  #[test_case("\\**", "bdir/")]
  #[test_case("\\**", "Beware")]
  #[test_case("\\**", "c")]
  #[test_case("\\**", "ca")]
  #[test_case("\\**", "cb")]
  #[test_case("\\**", "d")]
  #[test_case("\\**", "dd")]
  #[test_case("\\**", "de")]
  fn bash_escaping_not(glob: &str, path: &str) {
    assert!(!glob_match(glob, path), "`{}` matches `{}`", path, glob);
  }

  #[test_case("a*[^c]", "abd")]
  #[test_case("a*[^c]", "abe")]
  #[test_case("a[X-]b", "a-b")]
  #[test_case("a[X-]b", "aXb")]
  #[test_case("[a-y]*[^c]", "a*")]
  #[test_case("[a-y]*[^c]", "a123b")]
  #[test_case("[a-y]*[^c]", "ab")]
  #[test_case("[a-y]*[^c]", "abd")]
  #[test_case("[a-y]*[^c]", "abe")]
  #[test_case("[a-y]*[^c]", "bd")]
  #[test_case("[a-y]*[^c]", "bb")]
  #[test_case("[a-y]*[^c]", "bcd")]
  #[test_case("[a-y]*[^c]", "bdir/")]
  #[test_case("[a-y]*[^c]", "ca")]
  #[test_case("[a-y]*[^c]", "cb")]
  #[test_case("[a-y]*[^c]", "dd")]
  #[test_case("[a-y]*[^c]", "dd" ; "dd 1")]
  #[test_case("[a-y]*[^c]", "dd" ; "dd 2")]
  #[test_case("[a-y]*[^c]", "de")]
  #[test_case("[a-y]*[^c]", "baz")]
  #[test_case("[a-y]*[^c]", "bzz" ; "bzz 1")]
  #[test_case("[a-y]*[^c]", "bzz" ; "bzz 2")]
  #[test_case("[a-y]*[^c]", "beware")]
  #[test_case("a\\*b/*", "a*b/ooo")]
  #[test_case("a\\*?/*", "a*b/ooo")]
  #[test_case("a[b]c", "abc")]
  #[test_case("a[\"b\"]c", "abc" ; "abc 1")]
  #[test_case("a[\\\\b]c", "abc" ; "abc 2")]
  #[test_case("a[b-d]c", "abc")]
  #[test_case("a?c", "abc")]
  #[test_case("*/man*/bash.*", "man/man1/bash.1")]
  #[test_case("[^a-c]*", "*" ; "ac 1")]
  #[test_case("[^a-c]*", "**" ; "ac 2")]
  #[test_case("[^a-c]*", "Beware" ; "beware 1")]
  #[test_case("[^a-c]*", "Beware" ; "beware 2")]
  #[test_case("[^a-c]*", "d")]
  #[test_case("[^a-c]*", "dd")]
  #[test_case("[^a-c]*", "de")]
  #[test_case("[^a-c]*", "BZZ")]
  #[test_case("[^a-c]*", "BewAre")]
  fn bash_classes(glob: &str, path: &str) {
    assert!(
      glob_match(glob, path),
      "`{}` does not match `{}`",
      path,
      glob
    );
  }

  #[test_case("a*[^c]", "*" ; "ac 1")]
  #[test_case("a*[^c]", "**" ; "ac 2")]
  #[test_case("a*[^c]", "\\*" ; "ac 3")]
  #[test_case("a*[^c]", "a" ; "aca 1")]
  #[test_case("a*[^c]", "a/*" ; "aca 2")]
  #[test_case("a*[^c]", "abc" ; "a star not c abc")]
  #[test_case("a*[^c]", "b" ; "a star not c b")]
  #[test_case("a*[^c]", "bb" ; "a star not c bb")]
  #[test_case("a*[^c]", "bcd" ; "a star not c bcd")]
  #[test_case("a*[^c]", "bdir/" ; "a star not c bdir/")]
  #[test_case("a*[^c]", "Beware" ; "a star not c beware")]
  #[test_case("a*[^c]", "c" ; "a star not c c")]
  #[test_case("a*[^c]", "ca" ; "a star not c ca")]
  #[test_case("a*[^c]", "cb" ; "a star not c cb")]
  #[test_case("a*[^c]", "d" ; "a star not c d")]
  #[test_case("a*[^c]", "dd" ; "a star not c dd")]
  #[test_case("a*[^c]", "de" ; "a star not c de")]
  #[test_case("a*[^c]", "baz" ; "a star not c baz")]
  #[test_case("a*[^c]", "bzz" ; "bzz 1")]
  #[test_case("a*[^c]", "BZZ" ; "bzz 2")]
  #[test_case("a*[^c]", "beware" ; "beware 1")]
  #[test_case("a*[^c]", "BewAre" ; "beware 2")]
  #[test_case("[a-y]*[^c]", "*" ; "ayc 1")]
  #[test_case("[a-y]*[^c]", "**" ; "ayc 2")]
  #[test_case("[a-y]*[^c]", "\\*" ; "ayc 3")]
  #[test_case("[a-y]*[^c]", "a" ; "ayca 1")]
  #[test_case("[a-y]*[^c]", "a123c")]
  #[test_case("[a-y]*[^c]", "a/*" ; "ayca 2")]
  #[test_case("[a-y]*[^c]", "abc")]
  #[test_case("[a-y]*[^c]", "b")]
  #[test_case("[a-y]*[^c]", "Beware" ; "beware 3")]
  #[test_case("[a-y]*[^c]", "c")]
  #[test_case("[a-y]*[^c]", "d")]
  // assert(!isMatch('bzz', '[a-y]*[^c]', { regex: true }));
  #[test_case("[a-y]*[^c]", "BZZ")]
  #[test_case("[a-y]*[^c]", "BewAre" ; "beware 4")]
  #[test_case("a[b]c", "*" ; "abc 1")]
  #[test_case("a[b]c", "**" ; "abc 2")]
  #[test_case("a[b]c", "\\*" ; "abc 3")]
  #[test_case("a[b]c", "a" ; "abca 1")]
  #[test_case("a[b]c", "a/*" ; "abca 2")]
  #[test_case("a[b]c", "abd" ; "a oneof b c abd")]
  #[test_case("a[b]c", "abe" ; "a oneof b c abe")]
  #[test_case("a[b]c", "b" ; "a oneof b c b")]
  #[test_case("a[b]c", "bb" ; "a oneof b c bb")]
  #[test_case("a[b]c", "bcd" ; "a oneof b c bcd")]
  #[test_case("a[b]c", "bdir/" ; "a oneof b c bdir/")]
  #[test_case("a[b]c", "Beware" ; "a oneof b c Beware")]
  #[test_case("a[b]c", "c" ; "a oneof b c c")]
  #[test_case("a[b]c", "ca" ; "a oneof b c ca")]
  #[test_case("a[b]c", "cb" ; "a oneof b c cb")]
  #[test_case("a[b]c", "d" ; "a oneof b c d")]
  #[test_case("a[b]c", "dd" ; "a oneof b c dd")]
  #[test_case("a[b]c", "de" ; "a oneof b c de")]
  #[test_case("a[b]c", "baz" ; "a oneof b c baz")]
  #[test_case("a[b]c", "bzz" ; "abc bzz 1")]
  #[test_case("a[b]c", "BZZ" ; "abc bzz 2")]
  #[test_case("a[b]c", "beware" ; "abc beware 1")]
  #[test_case("a[b]c", "BewAre" ; "abc beware 2")]
  #[test_case("a[\"b\"]c", "*" ; "abc 4")]
  #[test_case("a[\"b\"]c", "**" ; "abc 5")]
  #[test_case("a[\"b\"]c", "\\*" ; "abc 6")]
  #[test_case("a[\"b\"]c", "a" ; "abca 3")]
  #[test_case("a[\"b\"]c", "a/*" ; "abca 4")]
  #[test_case("a[\"b\"]c", "abd" ; "abd 1")]
  #[test_case("a[\"b\"]c", "abe" ; "abe 1")]
  #[test_case("a[\"b\"]c", "b" ; "abcb 1")]
  #[test_case("a[\"b\"]c", "bb" ; "abcbb 1")]
  #[test_case("a[\"b\"]c", "bcd" ; "abc bcd 1")]
  #[test_case("a[\"b\"]c", "bdir/" ; "abc bdir/ 1")]
  #[test_case("a[\"b\"]c", "Beware" ; "abc beware 3")]
  #[test_case("a[\"b\"]c", "c" ; "abc c 1")]
  #[test_case("a[\"b\"]c", "ca" ; "abc ca 1")]
  #[test_case("a[\"b\"]c", "cb" ; "abc cb 1")]
  #[test_case("a[\"b\"]c", "d" ; "abc d 1")]
  #[test_case("a[\"b\"]c", "dd" ; "abc dd 1")]
  #[test_case("a[\"b\"]c", "de" ; "abc de 1")]
  #[test_case("a[\"b\"]c", "baz" ; "abc baz 1")]
  #[test_case("a[\"b\"]c", "bzz" ; "abc bzz 3")]
  #[test_case("a[\"b\"]c", "BZZ" ; "abc bzz 4")]
  #[test_case("a[\"b\"]c", "beware" ; "abc beware 4")]
  #[test_case("a[\"b\"]c", "BewAre" ; "abc beware 5")]
  #[test_case("a[\\\\b]c", "*" ; "a double escape b c star")]
  #[test_case("a[\\\\b]c", "**" ; "a double escape b c doublestar")]
  #[test_case("a[\\\\b]c", "\\*" ; "a double escape b c backslash star")]
  #[test_case("a[\\\\b]c", "a" ; "a double escape b c a")]
  #[test_case("a[\\\\b]c", "a/*" ;  "a double escape b c a slash star")]
  #[test_case("a[\\\\b]c", "abd" ; "a double escape b c abd")]
  #[test_case("a[\\\\b]c", "abe" ; "a double escape b c abe")]
  #[test_case("a[\\\\b]c", "b" ; "a double escape b c b")]
  #[test_case("a[\\\\b]c", "bb" ; "a double escape b c bb")]
  #[test_case("a[\\\\b]c", "bcd" ; "a double escape b c bcd")]
  #[test_case("a[\\\\b]c", "bdir/" ; "a double escape b c bdir slash")]
  #[test_case("a[\\\\b]c", "Beware" ; "a double escape b c Beware 1")]
  #[test_case("a[\\\\b]c", "c" ; "a double escape b c c")]
  #[test_case("a[\\\\b]c", "ca" ; "a double escape b c ca")]
  #[test_case("a[\\\\b]c", "cb" ; "a double escape b c cb")]
  #[test_case("a[\\\\b]c", "d" ; "a double escape b c d")]
  #[test_case("a[\\\\b]c", "dd" ; "a double escape b c dd")]
  #[test_case("a[\\\\b]c", "de" ; "a double escape b c de")]
  #[test_case("a[\\\\b]c", "baz" ; "a double escape b c baz")]
  #[test_case("a[\\\\b]c", "bzz" ; "a double escape b c bzz")]
  #[test_case("a[\\\\b]c", "BZZ" ;  "a double escape b c BZZ 2")]
  #[test_case("a[\\\\b]c", "beware" ; "a double escape b c beware 2")]
  #[test_case("a[\\\\b]c", "BewAre" ; "a double escape b c BewAre 3")]
  #[test_case("a[\\b]c", "*" ; "a escape b c 1")]
  #[test_case("a[\\b]c", "**" ; "a escape b c 2")]
  #[test_case("a[\\b]c", "\\*")]
  #[test_case("a[\\b]c", "a" ; "a escape b c a")]
  #[test_case("a[\\b]c", "a/*" ; "a escape b c a 2")]
  #[test_case("a[\\b]c", "abd")]
  #[test_case("a[\\b]c", "abe")]
  #[test_case("a[\\b]c", "b")]
  #[test_case("a[\\b]c", "bb")]
  #[test_case("a[\\b]c", "bcd")]
  #[test_case("a[\\b]c", "bdir/")]
  #[test_case("a[\\b]c", "Beware")]
  #[test_case("a[\\b]c", "c")]
  #[test_case("a[\\b]c", "ca")]
  #[test_case("a[\\b]c", "cb")]
  #[test_case("a[\\b]c", "d")]
  #[test_case("a[\\b]c", "dd")]
  #[test_case("a[\\b]c", "de")]
  #[test_case("a[\\b]c", "baz")]
  #[test_case("a[\\b]c", "bzz" ; "a escape b c bzz")]
  #[test_case("a[\\b]c", "BZZ" ; "a escape b c BZZ 2")]
  #[test_case("a[\\b]c", "beware" ; "a escape b c beware")]
  #[test_case("a[\\b]c", "BewAre" ; "a escape b c BewAre 2")]
  #[test_case("a[b-d]c", "*" ; "a[b-d]c * 1")]
  #[test_case("a[b-d]c", "**" ; "a[b-d]c * 2")]
  #[test_case("a[b-d]c", "\\*")]
  #[test_case("a[b-d]c", "a" ; "a[b-d]c a 1")]
  #[test_case("a[b-d]c", "a/*" ; "a[b-d]c a/* 2")]
  #[test_case("a[b-d]c", "abd")]
  #[test_case("a[b-d]c", "abe")]
  #[test_case("a[b-d]c", "b")]
  #[test_case("a[b-d]c", "bb")]
  #[test_case("a[b-d]c", "bcd")]
  #[test_case("a[b-d]c", "bdir/")]
  #[test_case("a[b-d]c", "Beware")]
  #[test_case("a[b-d]c", "c")]
  #[test_case("a[b-d]c", "ca")]
  #[test_case("a[b-d]c", "cb")]
  #[test_case("a[b-d]c", "d")]
  #[test_case("a[b-d]c", "dd")]
  #[test_case("a[b-d]c", "de")]
  #[test_case("a[b-d]c", "baz")]
  #[test_case("a[b-d]c", "bzz" ; "a[b-d]c bzz 1")]
  #[test_case("a[b-d]c", "BZZ" ; "a[b-d]c BZZ 2")]
  #[test_case("a[b-d]c", "beware" ; "a[b-d]c beware 1")]
  #[test_case("a[b-d]c", "BewAre" ; "a[b-d]c BewAre 2")]
  #[test_case("a?c", "*" ; "a qmark c star")]
  #[test_case("a?c", "**" ;  "a qmark c star star")]
  #[test_case("a?c", "\\*" ; "a qmark c backslash star")]
  #[test_case("a?c", "a" ; "a qmark c a")]
  #[test_case("a?c", "a/*")]
  #[test_case("a?c", "abd")]
  #[test_case("a?c", "abe")]
  #[test_case("a?c", "b")]
  #[test_case("a?c", "bb")]
  #[test_case("a?c", "bcd")]
  #[test_case("a?c", "bdir/")]
  #[test_case("a?c", "c" ; "a qmark c c")]
  #[test_case("a?c", "ca")]
  #[test_case("a?c", "cb")]
  #[test_case("a?c", "d")]
  #[test_case("a?c", "dd")]
  #[test_case("a?c", "de")]
  #[test_case("a?c", "baz")]
  #[test_case("a?c", "bzz" ; "a qmark c bzz")]
  #[test_case("a?c", "BZZ" ; "a qmark c bzz 2")]
  #[test_case("a?c", "beware")]
  #[test_case("a?c", "Beware" ; "a qmark c beware 2")]
  #[test_case("a?c", "BewAre" ; "a qmark c beware 3")]
  #[test_case("[^a-c]*", "a" ; "not a to c a")]
  #[test_case("[^a-c]*", "a/*" ; "not a to c a slash star")]
  #[test_case("[^a-c]*", "abc")]
  #[test_case("[^a-c]*", "abd" ; "not a to c abd")]
  #[test_case("[^a-c]*", "abe" ; "not a to c abe")]
  #[test_case("[^a-c]*", "b" ; "not a to c b")]
  #[test_case("[^a-c]*", "bb" ; "not a to c bb")]
  #[test_case("[^a-c]*", "bcd" ; "not a to c bcd")]
  #[test_case("[^a-c]*", "bdir/" ; "not a to c bdir slash")]
  #[test_case("[^a-c]*", "c")]
  #[test_case("[^a-c]*", "ca" ; "not a to c ca")]
  #[test_case("[^a-c]*", "cb" ; "not a to c cb")]
  #[test_case("[^a-c]*", "baz" ; "not a to c baz")]
  #[test_case("[^a-c]*", "bzz")]
  #[test_case("[^a-c]*", "beware" ; "not a to c beware")]
  fn bash_classes_not(glob: &str, path: &str) {
    assert!(!glob_match(glob, path), "`{}` matches `{}`", path, glob);
  }

  #[test_case("]", "]")]
  #[test_case("a[]-]b", "a-b" ; "a dash b")]
  #[test_case("a[]-]b", "a]b" ; "a bracket b")]
  #[test_case("a[]]b", "a]b")]
  #[test_case("a[\\]a\\-]b", "aab")]
  #[test_case("t[a-g]n", "ten")]
  #[test_case("t[^a-g]n", "ton")]
  fn bash_wildmatch(glob: &str, path: &str) {
    assert!(glob_match(glob, path));
  }

  #[test_case("a[]-]b", "aab")]
  #[test_case("[ten]", "ten")]
  fn bash_wildmatch_not(glob: &str, path: &str) {
    assert!(!glob_match(glob, path), "`{}` matches `{}`", path, glob);
  }

  #[test_case("foo[/]bar", "foo/bar")]
  #[test_case("f[^eiu][^eiu][^eiu][^eiu][^eiu]r", "foo-bar")]
  fn bash_slashmatch(glob: &str, path: &str) {
    assert!(glob_match(glob, path));
  }

  // #[test_case("f[^eiu][^eiu][^eiu][^eiu][^eiu]r", "f[^eiu][^eiu][^eiu][^eiu][^eiu]r")]
  // fn bash_slashmatch_not(glob: &str, path: &str) {
  //   assert!(!glob_match(glob, path), "`{}` matches `{}`", path, glob);
  // }

  #[test_case("a**c", "abc" ; "a doublestar")]
  #[test_case("a***c", "abc" ; "a doublestar star")]
  #[test_case("a*****?c", "abc")]
  #[test_case("?*****??", "bbc")]
  #[test_case("?*****??", "abc")]
  #[test_case("*****??", "bbc" ; "bbc 2")]
  #[test_case("*****??", "abc" ; "abc 2")]
  #[test_case("?*****?c", "bbc" ; "c bbc 2")]
  #[test_case("?*****?c", "abc" ; "c abc 2")]
  #[test_case("?***?****c", "bbc")]
  #[test_case("?***?****c", "abc")]
  #[test_case("?***?****?", "bbc" ; "bbc 3")]
  #[test_case("?***?****?", "abc" ; "abc 3")]
  #[test_case("?***?****", "bbc" ; "bbc 4")]
  #[test_case("?***?****", "abc" ; "abc 4")]
  #[test_case("*******c", "bbc" ; "c bbc 3")]
  #[test_case("*******c", "abc" ; "c abc 3")]
  #[test_case("*******?", "bbc" ; "bbc 5")]
  #[test_case("*******?", "abc" ; "abc 5")]
  #[test_case("a*cd**?**??k", "abcdecdhjk" ; "bash extra stars")]
  #[test_case("a**?**cd**?**??k", "abcdecdhjk" ; "bash extra stars 2")]
  #[test_case("a**?**cd**?**??k***", "abcdecdhjk" ; "bash extra stars 3")]
  #[test_case("a**?**cd**?**??***k", "abcdecdhjk" ; "bash extra stars 4")]
  #[test_case("a**?**cd**?**??***k**", "abcdecdhjk")]
  #[test_case("a****c**?**??*****", "abcdecdhjk")]
  fn bash_extra_stars(glob: &str, path: &str) {
    assert!(glob_match(glob, path));
  }

  #[test_case("a**c", "bbc")]
  #[test_case("a**c", "bbd")]
  #[test_case("a***c", "bbc" ; "a doublestar star c")]
  #[test_case("a***c", "bbd" ; "a doublestar star d")]
  #[test_case("a*****?c", "bbc" ; "a 5 star qmark c")]
  #[test_case("?***?****c", "bbd")]
  fn bash_extra_stars_not(glob: &str, path: &str) {
    assert!(!glob_match(glob, path), "`{}` matches `{}`", path, glob);
  }

  #[test_case("*.js", "z.js")]
  #[test_case("z*.js", "z.js")]
  #[test_case("*/*", "a/z")]
  #[test_case("*/z*.js", "a/z.js")]
  #[test_case("a/z*.js", "a/z.js")]
  #[test_case("*", "ab" ; "star ab")]
  #[test_case("*", "abc")]
  #[test_case("*c", "abc")]
  #[test_case("a*", "abc")]
  #[test_case("a*c", "abc")]
  #[test_case("*r", "bar")]
  #[test_case("b*", "bar")]
  #[test_case("f*", "foo")]
  #[test_case("*abc*", "one abc two")]
  #[test_case("a*b", "a         b")]
  #[test_case("*a*", "bar")]
  #[test_case("*abc*", "oneabctwo")]
  #[test_case("*-*.*-*", "a-b.c-d" ; "10")]
  #[test_case("*-b*c-*", "a-b.c-d" ; "11")]
  #[test_case("*-b.c-*", "a-b.c-d" ; "12")]
  #[test_case("*.*", "a-b.c-d" ; "9")]
  #[test_case("*.*-*", "a-b.c-d")]
  #[test_case("*.*-d", "a-b.c-d")]
  #[test_case("*.c-*", "a-b.c-d")]
  #[test_case("*b.*d", "a-b.c-d")]
  #[test_case("a*.c*", "a-b.c-d")]
  #[test_case("a-*.*-d", "a-b.c-d")]
  #[test_case("*.*", "a.b" ; "star dot star a.b")]
  #[test_case("*.b", "a.b")]
  #[test_case("a.*", "a.b")]
  #[test_case("**-**.**-**", "a-b.c-d" ; "8")]
  #[test_case("**-b**c-**", "a-b.c-d" ; "7")]
  #[test_case("**-b.c-**", "a-b.c-d" ; "6")]
  #[test_case("**.**", "a-b.c-d" ; "doublestar dot doublestar a-b.c-d")]
  #[test_case("**.**-**", "a-b.c-d" ; "doublestar dot doublestar dash doublestar a-b.c-d")]
  #[test_case("**.**-d", "a-b.c-d" ; "5")]
  #[test_case("**.c-**", "a-b.c-d" ; "4")]
  #[test_case("**b.**d", "a-b.c-d" ; "3")]
  #[test_case("a**.c**", "a-b.c-d" ; "2")]
  #[test_case("a-**.**-d", "a-b.c-d" ; "1")]
  #[test_case("**.**", "a.b" ; "doublestar dot doublestar a.b")]
  #[test_case("**.b", "a.b" ; "doublestar dot b a.b")]
  #[test_case("a.**", "a.b" ; "a dot doublestar a.b")]
  #[test_case("a.b", "a.b" ; "a dot b a.b")]
  #[test_case("*/*", "/ab" ; "star slash star /ab")]
  #[test_case(".", ".")]
  #[test_case("/*", "/ab" ; "slash star")]
  #[test_case("/??", "/ab" ; "slash qmark qmark")]
  #[test_case("/?b", "/ab")]
  #[test_case("/*", "/cd")]
  #[test_case("a", "a" ; "basic match")]
  #[test_case("a/.*", "a/.b" ; "a dot star a/.b")]
  #[test_case("?/?", "a/b" ; "qmark slash qmark")]
  #[test_case("a/**/j/**/z/*.md", "a/b/c/d/e/j/n/p/o/z/c.md")]
  #[test_case("a/**/z/*.md", "a/b/c/d/e/z/c.md")]
  #[test_case("a/b/c/*.md", "a/b/c/xyz.md")]
  #[test_case("a/*/z/.a", "a/b/z/.a")]
  #[test_case("a/**/c/*.md", "a/bb.bb/aa/b.b/aa/c/xyz.md")]
  #[test_case("a/**/c/*.md", "a/bb.bb/aa/bb/aa/c/xyz.md")]
  #[test_case("a/*/c/*.md", "a/bb.bb/c/xyz.md")]
  #[test_case("a/*/c/*.md", "a/bb/c/xyz.md")]
  #[test_case("a/*/c/*.md", "a/bbbb/c/xyz.md")]
  #[test_case("*", "aaa")]
  #[test_case("ab", "ab" ; "ab ab")]
  #[test_case("*/*/*", "aaa/bba/ccc")]
  #[test_case("aaa/**", "aaa/bba/ccc")]
  #[test_case("aaa/*", "aaa/bbb")]
  #[test_case("*/*z*/*/*i", "ab/zzz/ejkl/hi")]
  #[test_case("*j*i", "abzzzejklhi")]
  #[test_case("*", "a" ; "star a")]
  #[test_case("*", "b" ; "star b")]
  #[test_case("*/*", "a/a" ; "star star a/a")]
  #[test_case("*/*/*", "a/a/a" ; "star star star a/a/a")]
  #[test_case("*/*/*/*", "a/a/a/a")]
  #[test_case("*/*/*/*/*", "a/a/a/a/a")]
  #[test_case("a/*", "a/a" ; "a star a")]
  #[test_case("a/*/*", "a/a/a" ; "a star star a")]
  #[test_case("a/*/*/*", "a/a/a/a" ; "a star star star a")]
  #[test_case("a/*/*/*/*", "a/a/a/a/a" ; "a star star star star a")]
  #[test_case("a/*/a", "a/a/a" ; "a star a a/a/a")]
  #[test_case("a/*/b", "a/a/b")]
  #[test_case("*/**/a", "a/a" ; "star doublestar a a/a")]
  #[test_case("*/**/a", "a/a/a" ; "star doublestar a a/a/a")]
  #[test_case("*/**/a", "a/a/a/a" ; "star doublestar a a/a/a/a")]
  #[test_case("*/**/a", "a/a/a/a/a" ; "star doublestar a a/a/a/a/a")]
  // #[test_case("*", "a/")]
  #[test_case("*/", "a/" ; "star slash a slash")]
  #[test_case("*{,/}", "a/" ; "star brace slash a slash")]
  #[test_case("*/*", "a/a")]
  #[test_case("a/*", "a/a" ; "a star a/a")]
  #[test_case("a/**/*.txt", "a/x/y.txt")]
  #[test_case("a/*.txt", "a/b.txt")]
  #[test_case("a*.txt", "a.txt")]
  #[test_case("*.txt", "a.txt")]
  #[test_case("**/..", "/home/foo/..")]
  #[test_case("**/a", "a"; "doublestar slash a a")]
  #[test_case("**", "a/a"; "doublestar a/a")]
  #[test_case("a/**", "a/a")]
  #[test_case("a/**", "a/" ; "a doublestar a slash")]
  // #[test_case("a/**", "a")]
  // #[test_case("**/a/**", "a")]
  // #[test_case("a/**", "a")]
  #[test_case("*/**/a", "a/a" ; "star doublestar a a slash a")]
  // #[test_case("a/**", "a")]
  #[test_case("*/**", "foo/" ; "star doublestar foo slash")]
  #[test_case("**/*", "foo/bar" ; "doublestar star foo/bar")]
  #[test_case("*/*", "foo/bar" ; "star star foo/bar")]
  #[test_case("*/**", "foo/bar" ; "star doublestar foo/bar")]
  #[test_case("**/", "foo/bar/" ; "doublestar foo/bar slash")]
  // #[test_case("**/*", "foo/bar/")]
  #[test_case("**/*/", "foo/bar/" ; "doublestar star foo/bar slash")]
  #[test_case("*/**", "foo/bar/" ; "star doublestar foo/bar slash")]
  #[test_case("*/*/", "foo/bar/" ; "star star foo/bar slash")]
  // #[test_case("foo/**", "foo")]
  #[test_case("/*", "/ab")]
  #[test_case("/*", "/cd" ; "star /cd")]
  #[test_case("/*", "/ef")]
  #[test_case("a/**/j/**/z/*.md", "a/b/j/c/z/x.md")]
  #[test_case("a/**/j/**/z/*.md", "a/j/z/x.md")]
  #[test_case("**/foo", "bar/baz/foo")]
  #[test_case("**/bar/*", "deep/foo/bar/baz" ; "doublestar bar star deep/foo/bar/baz")]
  #[test_case("**/bar/**", "deep/foo/bar/baz/" ; "doublestar bar doublestar deep/foo/bar/baz")]
  #[test_case("**/bar/*/*", "deep/foo/bar/baz/x")]
  #[test_case("foo/**/**/bar", "foo/b/a/z/bar" ; "foo doublestar doublestar bar foo/b/a/z/bar")]
  #[test_case("foo/**/bar", "foo/b/a/z/bar" ; "foo doublestar bar foo/b/a/z/bar")]
  #[test_case("foo/**/**/bar", "foo/bar" ; "foo doublestar doublestar bar foo/bar")]
  #[test_case("foo/**/bar", "foo/bar" ; "foo doublestar bar foo/bar")]
  #[test_case("*/bar/**", "foo/bar/baz/x")]
  #[test_case("foo/**/**/bar", "foo/baz/bar" ; "foo doublestar doublestar bar")]
  #[test_case("foo/**/bar", "foo/baz/bar" ; "foo doublestar bar")]
  #[test_case("**/foo", "XXX/foo")]
  fn stars(glob: &str, path: &str) {
    assert!(glob_match(glob, path))
  }

  #[test_case("*.js", "a/b/c/z.js")]
  #[test_case("*.js", "a/b/z.js")]
  #[test_case("*.js", "a/z.js")]
  // #[test_case("*/*", "a/.ab")]
  // #[test_case("*", ".ab")]
  #[test_case("f*", "bar")]
  #[test_case("*r", "foo")]
  #[test_case("b*", "foo")]
  #[test_case("*", "foo/bar")]
  #[test_case("*a*", "foo")]
  #[test_case("*-bc-*", "a-b.c-d" ; "star dash bc dash star a-b.c-d")]
  #[test_case("**-bc-**", "a-b.c-d" ; "doublestar dash bc dash doublestar a-b.c-d")]
  #[test_case("a/", "a/.b" ; "a slash a/.b")]
  #[test_case("bz", "a/b/z/.a")]
  #[test_case("*/*/*", "aaa" ; "star star star aaa")]
  #[test_case("*/*/*", "aaa/bb/aa/rr")]
  #[test_case("aaa*", "aaa/bba/ccc" ; "aaa star aaa/bba/ccc")]
  // #[test_case("aaa**", "aaa/bba/ccc")]
  #[test_case("aaa/*", "aaa/bba/ccc" ; "aaa slash star aaa/bba/ccc")]
  #[test_case("aaa/*ccc", "aaa/bba/ccc")]
  #[test_case("aaa/*z", "aaa/bba/ccc")]
  #[test_case("*/*/*", "aaa/bbb")]
  #[test_case("*/*jk*/*i", "ab/zzz/ejkl/hi")]
  #[test_case("*", "a/a" ; "star a/a")]
  #[test_case("*", "a/a/a" ; "star a/a/a")]
  #[test_case("*", "a/a/b" ; "star a/a/b")]
  #[test_case("*", "a/a/a/a" ; "star a/a/a/a")]
  #[test_case("*", "a/a/a/a/a" ; "star a/a/a/a/a")]
  #[test_case("*/*", "a" ; "star star a")]
  #[test_case("*/*", "a/a/a" ; "star star a/a/a")]
  #[test_case("*/*/*", "a" ; "star star star a")]
  #[test_case("*/*/*", "a/a" ; "star star star a/a")]
  #[test_case("*/*/*", "a/a/a/a" ; "star star star a/a/a/a")]
  #[test_case("*/*/*/*", "a" ; "star star star star a")]
  #[test_case("*/*/*/*", "a/a" ; "star star star star a/a")]
  #[test_case("*/*/*/*", "a/a/a" ; "star star star star a/a/a")]
  #[test_case("*/*/*/*", "a/a/a/a/a")]
  #[test_case("*/*/*/*/*", "a" ; "star star star star star a")]
  #[test_case("*/*/*/*/*", "a/a" ; "star star star star star a/a")]
  #[test_case("*/*/*/*/*", "a/a/a" ; "star star star star star a/a/a")]
  #[test_case("*/*/*/*/*", "a/a/b" ; "star star star star star a/a/b")]
  #[test_case("*/*/*/*/*", "a/a/a/a" ; "star star star star star a/a/a/a")]
  #[test_case("*/*/*/*/*", "a/a/a/a/a/a" ; "star star star star star")]
  #[test_case("a/*", "a" ; "a slash star a")]
  #[test_case("a/*", "a/a/a" ; "a slash star a/a/a")]
  #[test_case("a/*", "a/a/a/a" ; "a slash star a/a/a/a")]
  #[test_case("a/*", "a/a/a/a/a" ; "a slash star")]
  #[test_case("a/*/*", "a" ; "a slash star slash star a")]
  #[test_case("a/*/*", "a/a" ; "a slash star slash star a/a")]
  #[test_case("a/*/*", "b/a/a")]
  #[test_case("a/*/*", "a/a/a/a" ; "a slash star slash star a/a/a/a")]
  #[test_case("a/*/*", "a/a/a/a/a" ; "a slash star slash star")]
  #[test_case("a/*/*/*", "a" ; "a slash star slash star slash star a")]
  #[test_case("a/*/*/*", "a/a" ; "a slash star slash star slash star a/a")]
  #[test_case("a/*/*/*", "a/a/a" ; "a slash star slash star slash star a/a/a")]
  #[test_case("a/*/*/*", "a/a/a/a/a" ; "a slash star slash star slash star")]
  #[test_case("a/*/*/*/*", "a" ; "a slash star slash star slash star slash star a")]
  #[test_case("a/*/*/*/*", "a/a" ; "a slash star slash star slash star slash star a/a")]
  #[test_case("a/*/*/*/*", "a/a/a" ; "a slash star slash star slash star slash star a/a/a")]
  #[test_case("a/*/*/*/*", "a/a/b")]
  #[test_case("a/*/*/*/*", "a/a/a/a" ; "a slash star slash star slash star slash star")]
  #[test_case("a/*/a", "a")]
  #[test_case("a/*/a", "a/a")]
  #[test_case("a/*/a", "a/a/b")]
  #[test_case("a/*/a", "a/a/a/a" ; "a slash star slash a")]
  #[test_case("a/*/a", "a/a/a/a/a")]
  #[test_case("a/*/b", "a")]
  #[test_case("a/*/b", "a/a" ; "a slash star slash b")]
  #[test_case("a/*/b", "a/a/a")]
  #[test_case("a/*/b", "a/a/a/a")]
  #[test_case("a/*/b", "a/a/a/a/a")]
  #[test_case("*/**/a", "a" ; "star slash doublestar slash a a")]
  #[test_case("*/**/a", "a/a/b" ; "star slash doublestar slash a a/a/b")]
  #[test_case("*/", "a" ; "star slash a")]
  #[test_case("*/*", "a" ; "star slash star a")]
  // #[test_case("*/*", "a/")]
  // #[test_case("a/*", "a/")]
  #[test_case("*/", "a/a" ; "star slash a/a")]
  #[test_case("*/", "a/x/y" ; "star slash a/x/y")]
  #[test_case("*/*", "a/x/y" ; "star slash star a/x/y")]
  #[test_case("a/*", "a/x/y")]
  #[test_case("a/**/*.txt", "a.txt" ; "a doublestar star .txt")]
  #[test_case("a/**/*.txt", "a/x/y/z" ; "a slash doublestar star .txt")]
  #[test_case("a/*.txt", "a.txt" ; "a star .txt")]
  #[test_case("a/*.txt", "a/x/y.txt" ; "a slash star .txt a/x/y.txt")]
  #[test_case("a/*.txt", "a/x/y/z" ; "a slash star .txt a/x/y/z")]
  #[test_case("a*.txt", "a/b.txt")]
  #[test_case("a*.txt", "a/x/y.txt" ; "a*.txt")]
  #[test_case("a*.txt", "a/x/y/z")]
  #[test_case("*.txt", "a/b.txt")]
  #[test_case("*.txt", "a/x/y.txt")]
  #[test_case("*.txt", "a/x/y/z")]
  #[test_case("a*", "a/b")]
  #[test_case("a/**/b", "a/a/bb")]
  #[test_case("a/**/b", "a/bb")]
  #[test_case("*/**", "foo")]
  #[test_case("**/", "foo/bar" ; "doublestar slash")]
  #[test_case("**/*/", "foo/bar" ; "doublestar star slash")]
  #[test_case("*/*/", "foo/bar" ; "star star slash")]
  #[test_case("**/", "a/a" ; "doublestar slash a/a")]
  #[test_case("*/foo", "bar/baz/foo")]
  #[test_case("**/bar/*", "deep/foo/bar")]
  #[test_case("*/bar/**", "deep/foo/bar/baz/x")]
  #[test_case("/*", "ef")]
  #[test_case("foo?bar", "foo/bar")]
  #[test_case("**/bar*", "foo/bar/baz")]
  // #[test_case("**/bar**", "foo/bar/baz")]
  #[test_case("foo**bar", "foo/baz/bar" ; "foo doublestar bar")]
  #[test_case("foo*bar", "foo/baz/bar" ; "foo star bar")]
  fn stars_not(glob: &str, path: &str) {
    assert!(!glob_match(glob, path))
  }

  #[test_case("**/*.js", "a/b/c/d.js")]
  #[test_case("**/*.js", "a/b/c.js")]
  #[test_case("**/*.js", "a/b.js")]
  #[test_case("a/b/**/*.js", "a/b/c/d/e/f.js")]
  #[test_case("a/b/**/*.js", "a/b/c/d/e.js")]
  #[test_case("a/b/c/**/*.js", "a/b/c/d.js" ; "a b c slash doublestar star js")]
  #[test_case("a/b/**/*.js", "a/b/c/d.js")]
  #[test_case("a/b/**/*.js", "a/b/d.js")]
  #[test_case("a/**/b/**/c", "a/b/c/b/c")]
  #[test_case("a/**b**/c", "a/aba/c")]
  #[test_case("a/**b**/c", "a/b/c")]
  #[test_case("a/b/c**/*.js", "a/b/c/d.js" ; "a b c doublestar star js")]
  #[test_case("**/a", "a" ; "doublestar a a")]
  // #[test_case("a/**", "a")]
  #[test_case("**", "a/" ; "doublestar a slash")]
  #[test_case("**/a/**", "a/" ; "doublestar a doublestar a slash")]
  #[test_case("a/**", "a/" ; "a doublestar a slash")]
  #[test_case("a/**/**", "a/" ; "a doublestar doublestar a slash")]
  #[test_case("**/a", "a/a" ; "doublestar a a/a")]
  #[test_case("a/**", "a/b" ; "a doublestar a/b")]
  #[test_case("a/**/**/**/*", "a/b" ; "a doublestar dobulestar dobulestar star a/b")]
  #[test_case("a/**/b", "a/b" ; "a doublestar b")]
  #[test_case("**/**", "a/b/c" ; "doublestar doublestar a/b/c")]
  #[test_case("*/**", "a/b/c" ; "star doublestar a/b/c")]
  #[test_case("a/**", "a/b/c" ; "a doublestar a/b/c")]
  #[test_case("a/**/**/*", "a/b/c" ; "a doublestar doublestar star a/b/c")]
  #[test_case("a/**/**/**/*", "a/b/c" ; "a doublestar dobulestar dobulestar star a/b/c")]
  #[test_case("a/**", "a/b/c/d" ; "a doublestar")]
  #[test_case("a/**/*", "a/b/c/d" ; "a doublestar star")]
  #[test_case("a/**/**/*", "a/b/c/d" ; "a doublestar dobulestar star")]
  #[test_case("a/**/**/**/*", "a/b/c/d" ; "a doublestar dobulestar dobulestar star")]
  #[test_case("a/b/**/c/**/*.*", "a/b/c/d.e")]
  #[test_case("a/**/f/*.md", "a/b/c/d/e/f/g.md")]
  #[test_case("a/**/f/**/k/*.md", "a/b/c/d/e/f/g/h/i/j/k/l.md")]
  #[test_case("a/b/c/*.md", "a/b/c/def.md")]
  #[test_case("a/*/c/*.md", "a/bb.bb/c/ddd.md")]
  #[test_case("a/**/f/*.md", "a/bb.bb/cc/d.d/ee/f/ggg.md")]
  #[test_case("a/**/f/*.md", "a/bb.bb/cc/dd/ee/f/ggg.md")]
  #[test_case("a/*/c/*.md", "a/bb/c/ddd.md")]
  #[test_case("a/*/c/*.md", "a/bbbb/c/ddd.md")]
  // #[test_case("a/**", "a")]
  // #[test_case("a{,/**}", "a")]
  #[test_case("**", "a/b/c/d" ; "doublestar")]
  #[test_case("**", "a/b/c/d/" ; "doublestar end slash")]
  #[test_case("**/**", "a/b/c/d/" ; "doublestar doublestar")]
  #[test_case("**/b/**", "a/b/c/d/")]
  #[test_case("a/b/**", "a/b/c/d/" ; "ab doublestar")]
  #[test_case("a/b/**/", "a/b/c/d/" ; "ab doublestar slash")]
  #[test_case("a/b/**/c/**/", "a/b/c/d/")]
  #[test_case("a/b/**/c/**/d/", "a/b/c/d/")]
  #[test_case("a/b/**/**/*.*", "a/b/c/d/e.f" ; "ab doublestar doublestar star dot star")]
  #[test_case("a/b/**/*.*", "a/b/c/d/e.f")]
  #[test_case("a/b/**/c/**/d/*.*", "a/b/c/d/e.f")]
  #[test_case("a/b/**/d/**/*.*", "a/b/c/d/e.f")]
  #[test_case("a/b/**/d/**/*.*", "a/b/c/d/g/e.f")]
  #[test_case("a/b/**/d/**/*.*", "a/b/c/d/g/g/e.f")]
  #[test_case("a/b-*/**/z.js", "a/b-c/z.js")]
  #[test_case("a/b-*/**/z.js", "a/b-c/d/e/z.js")]
  #[test_case("*/*", "a/b" ; "star star a/b")]
  #[test_case("a/b/c/*.md", "a/b/c/xyz.md")]
  #[test_case("a/*/c/*.md", "a/bb.bb/c/xyz.md")]
  #[test_case("a/*/c/*.md", "a/bb/c/xyz.md")]
  #[test_case("a/*/c/*.md", "a/bbbb/c/xyz.md")]
  #[test_case("**/*", "a/b/c" ; "doublestar star a/b/c")]
  #[test_case("a/**/j/**/z/*.md", "a/b/c/d/e/j/n/p/o/z/c.md")]
  #[test_case("a/**/z/*.md", "a/b/c/d/e/z/c.md")]
  #[test_case("a/**/c/*.md", "a/bb.bb/aa/b.b/aa/c/xyz.md")]
  #[test_case("a/**/c/*.md", "a/bb.bb/aa/bb/aa/c/xyz.md")]
  #[test_case("/**", "/a/b" ; "slash doublestar /a/b")]
  #[test_case("**/*", "a.b" ; "doublestar star a.b")]
  #[test_case("**/*", "a.js" ; "doublestar star a.js")]
  #[test_case("**/*.js", "a.js")]
  // #[test_case("a/**/", "a/")]
  #[test_case("**/*.js", "a/a.js")]
  #[test_case("**/*.js", "a/a/b.js")]
  #[test_case("a/**/b", "a/b" ; "a doublestar slash b")]
  #[test_case("a/**b", "a/b" ; "a slash doublestar b")]
  #[test_case("**/*.md", "a/b.md")]
  #[test_case("**/*", "a/b/c.js")]
  #[test_case("**/*", "a/b/c.txt")]
  #[test_case("a/**/", "a/b/c/d/" ; "a doublestar slash")]
  #[test_case("**/*", "a/b/c/d/a.js")]
  #[test_case("a/b/**/*.js", "a/b/c/z.js")]
  #[test_case("a/b/**/*.js", "a/b/z.js")]
  #[test_case("**/*", "ab")]
  #[test_case("**/*", "ab/c")]
  #[test_case("**/*", "ab/c/d")]
  #[test_case("**/*", "abc.js")]
  #[test_case("**", "a" ; "doublestar a")]
  #[test_case("**/**", "a" ; "doublestar doublestar a")]
  #[test_case("**/**/*", "a" ; "doublestar doublestar star a")]
  #[test_case("**/**/a", "a" ; "doublestar doublestar a a")]
  // #[test_case("**/a/**", "a")]
  // #[test_case("a/**", "a")]
  #[test_case("**", "a/b" ; "doublestar a/b")]
  #[test_case("**/**", "a/b" ; "doublestar doublestar a/b")]
  #[test_case("**/**/*", "a/b" ; "doublestar doublestar star a/b")]
  #[test_case("**/**/b", "a/b" ; "doublestar doublestar b a/b")]
  #[test_case("**/b", "a/b" ; "doublestar b")]
  // #[test_case("**/b/**", "a/b")]
  // #[test_case("*/b/**", "a/b")]
  #[test_case("a/**/*", "a/b" ; "a doublestar star a/b")]
  #[test_case("a/**/**/*", "a/b" ; "a doublestar doublestar star a/b")]
  #[test_case("**", "a/b/c" ; "doublestar a/b/c")]
  #[test_case("**/**/*", "a/b/c" ; "doublestar doublestar star a/b/c")]
  #[test_case("**/b/*", "a/b/c" ; "doublestar b star")]
  #[test_case("**/b/**", "a/b/c" ; "doublestar b doublestar a/b/c")]
  #[test_case("*/b/**", "a/b/c" ; "star b doublestar a/b/c")]
  #[test_case("a/**/*", "a/b/c" ; "a doublestar star a/b/c")]
  #[test_case("**", "a/b/c/d" ; "doublestar a/b/c/d")]
  #[test_case("**/**", "a/b/c/d" ; "doublestar doublestar a/b/c/d")]
  #[test_case("**/**/*", "a/b/c/d" ; "doublestar doublestar star a/b/c/d")]
  #[test_case("**/**/d", "a/b/c/d" ; "double doublestar d")]
  #[test_case("**/b/**", "a/b/c/d" ; "doublestar b doublestar a/b/c/d")]
  #[test_case("**/b/*/*", "a/b/c/d" ; "doublestar b star star")]
  #[test_case("**/d", "a/b/c/d" ; "doublestar d")]
  #[test_case("*/b/**", "a/b/c/d" ; "star b doublestar a/b/c/d")]
  #[test_case("a/**", "a/b/c/d" ; "a doublestar a/b/c/d")]
  #[test_case("a/**/*", "a/b/c/d" ; "a doublestar star a/b/c/d")]
  #[test_case("a/**/**/*", "a/b/c/d" ; "a doublestar doublestar star a/b/c/d")]
  fn globstars(glob: &str, path: &str) {
    assert!(glob_match(glob, path));
  }

  #[test_case("a/b/**/*.js", "a/d.js")]
  #[test_case("a/b/**/*.js", "d.js")]
  #[test_case("**c", "a/b/c")]
  #[test_case("a/**c", "a/b/c")]
  #[test_case("a/**z", "a/b/c")]
  #[test_case("a/**b**/c", "a/b/c/b/c")]
  #[test_case("a/b/c**/*.js", "a/b/c/d/e.js")]
  #[test_case("a/**/*", "a" ; "a doublestar star a")]
  #[test_case("a/**/**/*", "a" ; "a doublestar doublestar star a")]
  #[test_case("a/**/**/**/*", "a" ; "a doublestar doublestar doublestar star a")]
  #[test_case("**/a", "a/"; "doublestar a slash a/")]
  #[test_case("a/**/*", "a/" ; "a doublestar star slash a/")]
  #[test_case("a/**/**/*", "a/" ; "a doublestar doublestar star a/")]
  #[test_case("a/**/**/**/*", "a/" ; "a doublestar doublestar doublestar star a/")]
  #[test_case("**/a", "a/b" ; "doublestar a slash a/b")]
  #[test_case("a/**/j/**/z/*.md", "a/b/c/j/e/z/c.txt")]
  #[test_case("a/**/b", "a/bb")]
  #[test_case("**/a", "a/c")]
  #[test_case("**/a", "a/b" ; "doublestar a a/b")]
  #[test_case("**/a", "a/x/y")]
  #[test_case("**/a", "a/b/c/d" ; "doublestar a a/b/c/d")]
  #[test_case("a/b/**/f", "a/b/c/d/")]
  #[test_case("a/b/**/c{d,e}/**/xyz.md", "a/b/c/xyz.md")]
  #[test_case("a/b/**/c{d,e}/**/xyz.md", "a/b/d/xyz.md")]
  #[test_case("a/**/", "a/b")]
  // #[test_case("**/*", "a/b/.js/c.txt")]
  #[test_case("a/**/", "a/b/c/d")]
  #[test_case("a/**/", "a/bb")]
  #[test_case("a/**/", "a/cb")]
  #[test_case("**/", "a" ; "doublestar a")]
  #[test_case("**/a/*", "a" ; "doublestar a star")]
  #[test_case("**/a/*/*", "a" ; "doublestar a star star")]
  #[test_case("*/a/**", "a" ; "star a doublestar")]
  #[test_case("**/", "a/b")]
  #[test_case("**/b/*", "a/b" ; "doublestar b star")]
  #[test_case("**/b/*/*", "a/b" ; "doublestar b star star a/b")]
  #[test_case("b/**", "a/b")]
  #[test_case("**/", "a/b/c")]
  #[test_case("**/**/b", "a/b/c" ; "double doublestar b")]
  #[test_case("**/b", "a/b/c" ; "doublestar b")]
  #[test_case("**/b/*/*", "a/b/c" ; "doublestar b star star a/b/c")]
  #[test_case("b/**", "a/b/c")]
  #[test_case("**/", "a/b/c/d")]
  #[test_case("**/d/*", "a/b/c/d")]
  #[test_case("b/**", "a/b/c/d")]
  fn globstars_not(glob: &str, path: &str) {
    assert!(!glob_match(glob, path));
  }

  #[test_case("フ*/**/*", "フォルダ/aaa.js")]
  #[test_case("フォ*/**/*", "フォルダ/aaa.js")]
  #[test_case("フォル*/**/*", "フォルダ/aaa.js")]
  #[test_case("フ*ル*/**/*", "フォルダ/aaa.js")]
  #[test_case("フォルダ/**/*", "フォルダ/aaa.js")]
  fn utf8(glob: &str, path: &str) {
    assert!(glob_match(glob, path));
  }

  #[test_case("*!*.md", "!foo!.md" ; "not star")]
  #[test_case("\\!*!*.md", "!foo!.md" ; "escaped not star")]
  #[test_case("!*foo", "abc" ; "not foo")]
  #[test_case("!foo*", "abc" ; "not foo then star")]
  #[test_case("!xyz", "abc")]
  #[test_case("*!*.*", "ba!r.js")]
  #[test_case("*.md", "bar.md")]
  #[test_case("*!*.*", "foo!.md")]
  #[test_case("*!*.md", "foo!.md" ; "star not star dot star")]
  #[test_case("*!.md", "foo!.md" ; "star not dot star")]
  #[test_case("*.md", "foo!.md" ; "dot star")]
  #[test_case("foo!.md", "foo!.md")]
  #[test_case("*!*.md", "foo!bar.md")]
  #[test_case("*b*.md", "foobar.md")]
  #[test_case("a!!b", "a!!b" ; "a not not b")]
  #[test_case("!a/b", "a" ; "not a then slash b a")]
  #[test_case("!a/b", "a.b" ; "not a then slash b a.b")]
  #[test_case("!a/b", "a/a")]
  #[test_case("!a/b", "a/c")]
  #[test_case("!a/b", "b/a")]
  #[test_case("!a/b", "b/b")]
  #[test_case("!a/b", "b/c")]
  #[test_case("!!abc", "abc" ; "not not abc abc")]
  #[test_case("!!!!abc", "abc" ; "not not not not abc abc")]
  #[test_case("!!!!!!abc", "abc" ; "not not not not not not abc abc")]
  #[test_case("!!!!!!!!abc", "abc" ; "not not not not not not not abc abc")]
  #[test_case("!(*/*)", "a" ; "not capture star a")]
  #[test_case("!(*/*)", "a.b")]
  #[test_case("!(*/b)", "a")]
  #[test_case("!(*/b)", "a.b" ; "not star slash b a dot b")]
  #[test_case("!(*/b)", "a/a" ; "not star slash b a slash a")]
  #[test_case("!(*/b)", "a/c" ; "not star slash b a slash c")]
  #[test_case("!(*/b)", "b/a" ; "not star slash b b slash a")]
  #[test_case("!(*/b)", "b/c" ; "not star slash b b slash c")]
  #[test_case("!(a/b)", "a"; "not a slash b a")]
  #[test_case("!(a/b)", "a.b")]
  #[test_case("!(a/b)", "a/a" ; "not a slash b, a slash a")]
  #[test_case("!(a/b)", "a/c" ; "not a slash b, a slash c")]
  #[test_case("!(a/b)", "b/a" ; "not a slash b, b slash a")]
  #[test_case("!(a/b)", "b/b" ; "not a slash b, b slash b")]
  #[test_case("!(a/b)", "b/c" ; "not a slash b, b slash c")]
  #[test_case("!*", "a/a")]
  #[test_case("!*", "a/b" ; "not star a slash b")]
  #[test_case("!*", "a/c")]
  #[test_case("!*", "b/a" ; "not star b slash a")]
  #[test_case("!*", "b/b")]
  #[test_case("!*", "b/c")]
  #[test_case("!*/*", "a")]
  #[test_case("!*/*", "a.b" ; "not star a dot b")]
  #[test_case("!*/b", "a" ; "not b a")]
  #[test_case("!*/b", "a.b")]
  #[test_case("!*/b", "a/a")]
  #[test_case("!*/b", "a/c")]
  #[test_case("!*/b", "b/a")]
  #[test_case("!*/b", "b/c" ; "not b b slash c")]
  #[test_case("!*/c", "a")]
  #[test_case("!*/c", "a.b" ; "not c a dot b")]
  #[test_case("!*/c", "a/a")]
  #[test_case("!*/c", "a/b" ; "not c a slash b")]
  #[test_case("!*/c", "b/a")]
  #[test_case("!*/c", "b/b")]
  #[test_case("!*a*", "foo")]
  // #[test_case("!a/(*)", "a")]
  // #[test_case("!a/(*)", "a.b")]
  // #[test_case("!a/(*)", "b/a")]
  // #[test_case("!a/(*)", "b/b")]
  // #[test_case("!a/(*)", "b/c")]
  // #[test_case("!a/(b)", "a")]
  // #[test_case("!a/(b)", "a.b")]
  // #[test_case("!a/(b)", "a/a")]
  // #[test_case("!a/(b)", "a/c")]
  // #[test_case("!a/(b)", "b/a")]
  // #[test_case("!a/(b)", "b/b")]
  // #[test_case("!a/(b)", "b/c")]
  #[test_case("!a/*", "a" ; "not a / star")]
  #[test_case("!a/*", "a.b")]
  #[test_case("!a/*", "b/a")]
  #[test_case("!a/*", "b/b")]
  #[test_case("!a/*", "b/c")]
  #[test_case("!f*b", "bar")]
  #[test_case("!f*b", "foo")]
  #[test_case("!**/*.md", "a.js" ; "doublestar md ajs 1")]
  #[test_case("!**/*.md", "c.txt" ; "star md ctxt 1")]
  #[test_case("!*.md", "a.js" ; "star md ajs 2")]
  #[test_case("!*.md", "c.txt" ; "star md ctxt 2")]
  #[test_case("!*.md", "abc.txt")]
  #[test_case("!.md", "foo.md")]
  #[test_case("!*.md", "b.txt")]
  #[test_case("!a/*/*/a.js", "b/a/b/a.js" ; "aajs babajs 1")]
  #[test_case("!a/*/*/a.js", "c/a/c/a.js" ; "aajs cacajs 1")]
  #[test_case("!a/a*.txt", "a/b.txt" ; "aatxt abtxt 1")]
  #[test_case("!a/a*.txt", "a/c.txt" ; "aatxt actxt 1")]
  #[test_case("!a.a*.txt", "a.b.txt" ; "aatxt abtxt 2")]
  #[test_case("!a.a*.txt", "a.c.txt" ; "aatxt actxt 2")]
  #[test_case("!*.md", "a.js" ; "not star md ajs 1")]
  #[test_case("!*.md", "b.txt" ; "md b txt")]
  #[test_case("!a/**/a.js", "b/a/b/a.js" ; "aajs babajs 2")]
  #[test_case("!a/**/a.js", "c/a/c/a.js" ; "aajs cacajs 2")]
  #[test_case("!**/*.md", "a/b.js")]
  #[test_case("!**/*.md", "a.js" ; "not doublestar md ajs 2")]
  #[test_case("**/*.md", "a/b.md" ; "md ab txt")]
  #[test_case("**/*.md", "a.md")]
  #[test_case("!**/*.md", "a/b.js" ; "doublestar md ab js")]
  #[test_case("!*.md", "a/b.js" ; "star md ab js")]
  #[test_case("!*.md", "a/b.md")]
  #[test_case("!**/*.md", "c.txt")]
  fn negation(glob: &str, path: &str) {
    assert!(glob_match(glob, path));
  }

  #[test_case("!*", "abc")]
  #[test_case("!abc", "abc")]
  #[test_case("*!.md", "bar.md")]
  #[test_case("foo!.md", "bar.md")]
  #[test_case("\\!*!*.md", "foo!.md" ; "not star not star md foo md")]
  #[test_case("\\!*!*.md", "foo!bar.md")]
  #[test_case("a!!b", "a")]
  #[test_case("a!!b", "aa")]
  #[test_case("a!!b", "a/b" ; "a not not b a slash b")]
  #[test_case("a!!b", "a!b" ; "a not not b a!b")]
  #[test_case("a!!b", "a/!!/b" ; "a not not b a slash not not slash b")]
  #[test_case("!a/b", "a/b" ; "not a slash b a slash b")]
  #[test_case("!abc", "abc" ; "not abc abc")]
  #[test_case("!!!abc", "abc" ; "not not not abc abc")]
  #[test_case("!!!!!abc", "abc" ; "not not not not not abc abc")]
  #[test_case("!!!!!!!abc", "abc" ; "not not not not not not not abc abc")]
  // #[test_case("!(*/*)", "a/a")]
  // #[test_case("!(*/*)", "a/b")]
  // #[test_case("!(*/*)", "a/c")]
  // #[test_case("!(*/*)", "b/a")]
  // #[test_case("!(*/*)", "b/b")]
  // #[test_case("!(*/*)", "b/c")]
  // #[test_case("!(*/b)", "a/b")]
  // #[test_case("!(*/b)", "b/b")]
  // #[test_case("!(a/b)", "a/b")]
  #[test_case("!*", "a")]
  #[test_case("!*", "a.b" ; "not star a dot b")]
  #[test_case("!*/*", "a/a")]
  #[test_case("!*/*", "a/b")]
  #[test_case("!*/*", "a/c")]
  #[test_case("!*/*", "b/a")]
  #[test_case("!*/*", "b/b")]
  #[test_case("!*/*", "b/c")]
  #[test_case("!*/b", "a/b")]
  #[test_case("!*/b", "b/b")]
  #[test_case("!*/c", "a/c" ; "not star slash c a slash c")]
  #[test_case("!*/c", "b/c")]
  #[test_case("!*a*", "bar")]
  #[test_case("!*a*", "fab")]
  // #[test_case("!a/(*)", "a/a")]
  // #[test_case("!a/(*)", "a/b")]
  // #[test_case("!a/(*)", "a/c")]
  // #[test_case("!a/(b)", "a/b")]
  #[test_case("!a/*", "a/a")]
  #[test_case("!a/*", "a/b")]
  #[test_case("!a/*", "a/c")]
  #[test_case("!f*b", "fab")]
  #[test_case("!.md", ".md")]
  // #[test_case("!**/*.md", "b.md")]
  #[test_case("!*.md", "b.md")]
  #[test_case("!*.md", "abc.md")]
  #[test_case("!*.md", "foo.md")]
  #[test_case("!*.md", "c.md")]
  #[test_case("!a/*/a.js", "a/a/a.js")]
  #[test_case("!a/*/a.js", "a/b/a.js")]
  #[test_case("!a/*/a.js", "a/c/a.js")]
  #[test_case("!a/*/*/a.js", "a/a/a/a.js")]
  #[test_case("!a/a*.txt", "a/a.txt" ; "not a slash star txt a slash a dot txt")]
  #[test_case("!a.a*.txt", "a.a.txt" ; "not a dot a star txt a dot a dot txt")]
  #[test_case("!a/*.txt", "a/a.txt")]
  #[test_case("!a/*.txt", "a/b.txt")]
  #[test_case("!a/*.txt", "a/c.txt")]
  #[test_case("!*.md", "c.md" ; "not star md c dot md")]
  // #[test_case("!**/a.js", "a/a/a.js")]
  // #[test_case("!**/a.js", "a/b/a.js")]
  // #[test_case("!**/a.js", "a/c/a.js")]
  #[test_case("!a/**/a.js", "a/a/a/a.js" ; "not a slash doublestar slash a js a/a/a/a.js")]
  // #[test_case("!**/*.md", "a.md")]
  #[test_case("**/*.md", "a/b.js")]
  #[test_case("**/*.md", "a.js")]
  #[test_case("!**/*.md", "a/b.md")]
  // #[test_case("!**/*.md", "a.md")]
  #[test_case("!*.md", "a.md")]
  // #[test_case("!**/*.md", "b.md")]
  fn negation_not(glob: &str, path: &str) {
    assert!(!glob_match(glob, path));
  }

  #[test_case("?", "a")]
  #[test_case("??", "aa")]
  #[test_case("??", "ab")]
  #[test_case("???", "aaa")]
  #[test_case("a?c", "aac")]
  #[test_case("a?c", "abc")]
  #[test_case("a?b", "acb")]
  #[test_case("a/??/c/??/e.md", "a/bb/c/dd/e.md")]
  #[test_case("a/?/c.md", "a/b/c.md")]
  #[test_case("a/?/c/?/e.md", "a/b/c/d/e.md")]
  #[test_case("a/?/c/???/e.md", "a/b/c/zzz/e.md")]
  #[test_case("a/??/c.md", "a/bb/c.md")]
  #[test_case("a/???/c.md", "a/bbb/c.md")]
  #[test_case("a/????/c.md", "a/bbbb/c.md")]
  fn question_mark(glob: &str, path: &str) {
    assert!(glob_match(glob, path));
  }

  #[test_case("?", "aa")]
  #[test_case("?", "ab")]
  #[test_case("?", "aaa")]
  #[test_case("?", "abcdefg")]
  #[test_case("??", "a")]
  #[test_case("??", "aaa" ; "double qmark aaa")]
  #[test_case("??", "abcdefg" ; "double qmark abcdefg")]
  #[test_case("???", "a" ; "triple qmark a")]
  #[test_case("???", "aa" ; "triple qmark aa")]
  #[test_case("???", "ab" ; "triple qmark ab")]
  #[test_case("???", "abcdefg" ; "triple qmark abcdefg")]
  #[test_case("a?c", "aaa")]
  #[test_case("ab?", "a")]
  #[test_case("ab?", "aa")]
  #[test_case("ab?", "ab")]
  #[test_case("ab?", "ac")]
  #[test_case("ab?", "abcd")]
  #[test_case("ab?", "abbb")]
  #[test_case("a/?/c/?/e.md", "a/bb/c/dd/e.md")]
  #[test_case("a/??/c.md", "a/bbb/c.md")]
  #[test_case("a/?/c/???/e.md", "a/b/c/d/e.md")]
  #[test_case("a/?/c.md", "a/bb/c.md")]
  fn question_mark_not(glob: &str, path: &str) {
    assert!(!glob_match(glob, path));
  }

  #[test_case("{a,b,c}", "a")]
  #[test_case("{a,b,c}", "b")]
  #[test_case("{a,b,c}", "c")]
  #[test_case("a/{a,b}", "a/a")]
  #[test_case("a/{a,b}", "a/b")]
  #[test_case("a/{a,b,c}", "a/c")]
  #[test_case("a{b,bc}.txt", "abc.txt")]
  #[test_case("foo[{a,b}]baz", "foo{baz")]
  #[test_case("a{,b}.txt", "a.txt" ; "abtxt 1")]
  #[test_case("a{b,}.txt", "a.txt" ; "abtxt 2")]
  #[test_case("a{a,b,}.txt", "aa.txt" ; "aabtxt 1")]
  #[test_case("a{a,b,}.txt", "aa.txt" ; "aabtxt 2")]
  #[test_case("a{,b}.txt", "ab.txt" ; "abtxt 3")]
  #[test_case("a{b,}.txt", "ab.txt" ; "abtxt 4")]
  // #[test_case("{a/,}a/**", "a")]
  #[test_case("a{a,b/}*.txt", "aa.txt")]
  #[test_case("a{a,b/}*.txt", "ab/.txt")]
  #[test_case("a{a,b/}*.txt", "ab/a.txt")]
  // #[test_case("{a/,}a/**", "a/")]
  #[test_case("{a/,}a/**", "a/a/" ; "ending slash")]
  // #[test_case("{a/,}a/**", "a/a")]
  #[test_case("{a/,}a/**", "a/a/a" ; "ending slash 1")]
  #[test_case("{a/,}a/**", "a/a/" ; "ending slash 2")]
  #[test_case("{a/,}a/**", "a/a/a/" ; "ending slash 3")]
  #[test_case("{a/,}b/**", "a/b/a/")]
  #[test_case("{a/,}b/**", "b/a/")]
  #[test_case("a{,/}*.txt", "a.txt")]
  #[test_case("a{,/}*.txt", "ab.txt")]
  #[test_case("a{,/}*.txt", "a/b.txt")]
  #[test_case("a{,/}*.txt", "a/ab.txt")]
  #[test_case("a{,.*{foo,db},\\(bar\\)}.txt", "a.txt")]
  #[test_case("a{,.*{foo,db},\\(bar\\)}.txt", "a.db.txt" ; "a db txt 1")]
  #[test_case("a{,*.{foo,db},\\(bar\\)}.txt", "a.db.txt" ; "a db txt 2")]
  #[test_case("a{,.*{foo,db},\\(bar\\)}", "a.db" ; "a db 1")]
  #[test_case("a{,*.{foo,db},\\(bar\\)}", "a.db" ; "a db 2")]
  #[test_case("{,.*{foo,db},\\(bar\\)}", ".db")]
  #[test_case("{*,*.{foo,db},\\(bar\\)}", "a")]
  #[test_case("{,*.{foo,db},\\(bar\\)}", "a.db")]
  #[test_case("a/b/**/c{d,e}/**/xyz.md", "a/b/cd/xyz.md")]
  #[test_case("a/b/**/{c,d,e}/**/xyz.md", "a/b/c/xyz.md")]
  #[test_case("a/b/**/{c,d,e}/**/xyz.md", "a/b/d/xyz.md")]
  #[test_case("a/b/**/{c,d,e}/**/xyz.md", "a/b/e/xyz.md")]
  #[test_case("*{a,b}*", "xax")]
  #[test_case("*{a,b}*", "xxax")]
  #[test_case("*{a,b}*", "xbx")]
  #[test_case("*{*a,b}", "xba")]
  #[test_case("*{*a,b}", "xb")]
  #[test_case("*???", "aaa" ; "aaa 1")]
  #[test_case("*****???", "aaa" ; "aaa 2")]
  #[test_case("a*?c", "aac")]
  #[test_case("a*?c", "abc" ; "abc")]
  #[test_case("a**?c", "abc" ; "abc 1")]
  #[test_case("a**?c", "acc")]
  #[test_case("a*****?c", "abc")]
  #[test_case("*****?", "a")]
  #[test_case("*****?", "aa")]
  #[test_case("*****?", "abc")]
  #[test_case("*****?", "zzz")]
  #[test_case("*****?", "bbb" ; "bbb 1")]
  #[test_case("*****?", "aaaa" ; "aaaa 1")]
  #[test_case("*****??", "aa" ; "aa 2")]
  #[test_case("*****??", "abc" ; "abc 2")]
  #[test_case("*****??", "zzz" ; "zzz 2")]
  #[test_case("*****??", "bbb" ; "bbb 2")]
  #[test_case("*****??", "aaaa" ; "aaaa 2")]
  #[test_case("?*****??", "abc" ; "abc 3")]
  #[test_case("?*****??", "zzz" ; "zzz 3")]
  #[test_case("?*****??", "bbb" ; "bbb 3")]
  #[test_case("?*****??", "aaaa")]
  #[test_case("?*****?c", "abc" ; "1")]
  #[test_case("?***?****c", "abc" ; "abc 4")]
  #[test_case("?***?****?", "abc" ; "abc 5")]
  #[test_case("?***?****?", "bbb" ; "bbb 4")]
  #[test_case("?***?****?", "zzz" ;  "zzz 4")]
  #[test_case("?***?****", "abc" ; "abc 6")]
  #[test_case("*******c", "abc" ; "2")]
  #[test_case("*******?", "abc" ; "abc 7")]
  #[test_case("a*cd**?**??k", "abcdecdhjk" ; "lots of options")]
  #[test_case("a**?**cd**?**??k", "abcdecdhjk" ; "lots of options 1")]
  #[test_case("a**?**cd**?**??k***", "abcdecdhjk" ; "lots of options 2")]
  #[test_case("a**?**cd**?**??***k", "abcdecdhjk" ; "lots of options 3")]
  #[test_case("a**?**cd**?**??***k**", "abcdecdhjk" ; "lots of options 4")]
  #[test_case("a****c**?**??*****", "abcdecdhjk")]
  #[test_case("a/?/c/?/*/e.md", "a/b/c/d/e/e.md")]
  #[test_case("a/?/c/?/*/e.md", "a/b/c/d/efghijk/e.md")]
  #[test_case("a/?/**/e.md", "a/b/c/d/efghijk/e.md")]
  #[test_case("a/??/e.md", "a/bb/e.md")]
  #[test_case("a/?/**/e.md", "a/b/ccc/e.md")]
  #[test_case("a/*/?/**/e.md", "a/b/c/d/efghijk/e.md" ; "long path option double star")]
  #[test_case("a/*/?/**/e.md", "a/b/c/d/efgh.ijk/e.md")]
  #[test_case("a/*/?/**/e.md", "a/b.bb/c/d/efgh.ijk/e.md")]
  #[test_case("a/*/?/**/e.md", "a/bbb/c/d/efgh.ijk/e.md")]
  #[test_case("a/*/ab??.md", "a/bbb/abcd.md")]
  #[test_case("a/bbb/ab??.md", "a/bbb/abcd.md")]
  #[test_case("a/bbb/ab???md", "a/bbb/abcd.md" ; "long path option")]
  #[test_case("a{,*.{foo,db},\\(bar\\)}.txt", "a.txt" ; "a.txt 2")]
  // #[test_case("a{,.*{foo,db},\\(bar\\)}", "a")]
  // #[test_case("a{,*.{foo,db},\\(bar\\)}", "a")]
  fn braces(glob: &str, path: &str) {
    assert!(glob_match(glob, path));
  }

  #[test_case("{a,b,c}", "aa")]
  #[test_case("{a,b,c}", "bb")]
  #[test_case("{a,b,c}", "cc")]
  #[test_case("a/{a,b}", "a/c")]
  #[test_case("a/{a,b}", "b/b")]
  #[test_case("a/{a,b,c}", "b/b")]
  #[test_case("a{,b}.txt", "abc.txt" ; "a brace b txt abc.txt")]
  #[test_case("a{a,b,}.txt", "abc.txt")]
  #[test_case("a{b,}.txt", "abc.txt")]
  #[test_case("a{,.*{foo,db},\\(bar\\)}.txt", "adb.txt" ; "a brace comma dot star abd.txt")]
  #[test_case("a{,*.{foo,db},\\(bar\\)}.txt", "adb.txt" ; "a brace comma star dot abd.txt")]
  #[test_case("a{,.*{foo,db},\\(bar\\)}", "adb" ; "a brace comma dot star abd")]
  #[test_case("a{,*.{foo,db},\\(bar\\)}", "adb" ; "a brace comma star dot abd")]
  #[test_case("{,.*{foo,db},\\(bar\\)}", "a" ; "brace comma dot star a")]
  #[test_case("{,*.{foo,db},\\(bar\\)}", "a" ; "brace comma star dot a")]
  #[test_case("{,*.{foo,db},\\(bar\\)}", "adb" ; "brace comma star dot abd")]
  #[test_case("{,.*{foo,db},\\(bar\\)}", "adb" ; "brace comma dot star abd")]
  #[test_case("{,.*{foo,db},\\(bar\\)}", "a.db")]
  #[test_case("a/b/**/c{d,e}/**/xyz.md", "a/b/c/xyz.md")]
  #[test_case("a/b/**/c{d,e}/**/xyz.md", "a/b/d/xyz.md")]
  #[test_case("*??", "a" ; "star qmark qmark a")]
  #[test_case("*???", "aa" ; "star qmark qmark qmark aa")]
  #[test_case("*****??", "a" ; "star star star star star qmark qmark a")]
  #[test_case("*****???", "aa" ; "star star star star star qmark qmark qmark aa")]
  #[test_case("a*?c", "aaa")]
  #[test_case("a**?c", "abb")]
  #[test_case("?*****??", "a" ; "qmark star star star star star qmark qmark a")]
  #[test_case("?*****??", "aa")]
  #[test_case("?*****?c", "abb")]
  #[test_case("?*****?c", "zzz" ; "qmark star star star star star qmark qmark zzz")]
  #[test_case("?***?****c", "bbb")]
  #[test_case("?***?****c", "zzz" ; "qmark star star star qmark star star star star c zzz")]
  #[test_case("a/?/c/?/*/e.md", "a/b/c/d/e.md")]
  #[test_case("a/?/e.md", "a/bb/e.md" ; "a qmark e.md")]
  #[test_case("a/?/**/e.md", "a/bb/e.md" ; "a qmark doublestar e.md")]
  fn braces_not(glob: &str, path: &str) {
    assert!(!glob_match(glob, path));
  }

  #[test_case("a/*[a-z]x/c", "a/yybx/c" => Some(vec!["yy", "b"]))]
  #[test_case("a/{b,c[}]*}", "a/c}xx" => Some(vec!["c}xx", "}", "xx"]))]
  #[test_case("a/b", "a/b" => Some(vec![]))]
  #[test_case("a/*/c", "a/bx/c" => Some(vec!["bx"]))]
  #[test_case("a/*/c", "a/test/c" => Some(vec!["test"]))]
  #[test_case("a/*/c/*/e", "a/b/c/d/e" => Some(vec!["b", "d"]))]
  #[test_case("a/{b,x}/c", "a/b/c" => Some(vec!["b"]))]
  #[test_case("a/{b,x}/c", "a/x/c" => Some(vec!["x"]))]
  #[test_case("a/?/c", "a/b/c" => Some(vec!["b"]))]
  #[test_case("a/*?x/c", "a/yybx/c" => Some(vec!["yy", "b"]))]
  #[test_case("a/{b*c,c}y", "a/bdcy" => Some(vec!["bdc", "d"]))]
  #[test_case("a/{b*,c}y", "a/bdy" => Some(vec!["bd", "d"]))]
  #[test_case("a/{b*c,c}", "a/bdc" => Some(vec!["bdc", "d"]))]
  #[test_case("a/{b*,c}", "a/bd" => Some(vec!["bd", "d"]))]
  #[test_case("a/{b*,c}", "a/c" => Some(vec!["c", ""]))]
  #[test_case("a/{b{c,d},c}y", "a/bdy" => Some(vec!["bd", "d"]))]
  #[test_case("a/{b*,c*}y", "a/bdy" => Some(vec!["bd", "d", ""]) ; "a/b*y or a/c*y a/bdy expects some vec bd d")]
  #[test_case("a/{b*,c*}y", "a/cdy" => Some(vec!["cd", "", "d"]))]
  #[test_case("a/{b,c}", "a/b" => Some(vec!["b"]))]
  #[test_case("a/{b,c}", "a/c" => Some(vec!["c"]) ; "a/b or a/c a/c expects some vec c")]
  #[test_case("a/{b,c[}]*}", "a/b" => Some(vec!["b", "", ""]) ; "a slash bracket b or c a/b expects some vec b")]
  // assert\.deepEqual\(([!])?capture\('(.*?)', ['"](.*?)['"]\), (.*)?\);
  // #[test_case("$2", "$3" => Some(vec!$4))]
  #[test_case("test/*", "test/foo" => Some(vec!["foo"]))]
  #[test_case("test/*/bar", "test/foo/bar" => Some(vec!["foo"]))]
  #[test_case("test/*/bar/*", "test/foo/bar/baz" => Some(vec!["foo", "baz"]))]
  #[test_case("test/*.js", "test/foo.js" => Some(vec!["foo"]))]
  #[test_case("test/*-controller.js", "test/foo-controller.js" => Some(vec!["foo"]))]
  #[test_case("test/**/*.js", "test/a.js" => Some(vec!["", "a"]))]
  #[test_case("test/**/*.js", "test/dir/a.js" => Some(vec!["dir", "a"]))]
  #[test_case("test/**/*.js", "test/dir/test/a.js" => Some(vec!["dir/test", "a"]))]
  #[test_case("**/*.js", "test/dir/a.js" => Some(vec!["test/dir", "a"]))]
  #[test_case("**/**/**/**/a", "foo/bar/baz/a" => Some(vec!["foo/bar/baz"]))]
  #[test_case("a/{b/**/y,c/**/d}", "a/b/y" => Some(vec!["b/y", "", ""]))]
  #[test_case("a/{b/**/y,c/**/d}", "a/b/x/x/y" => Some(vec!["b/x/x/y", "x/x", ""]))]
  #[test_case("a/{b/**/y,c/**/d}", "a/c/x/x/d" => Some(vec!["c/x/x/d", "", "x/x"]))]
  #[test_case("a/{b/**/**/y,c/**/**/d}", "a/b/x/x/x/x/x/y" => Some(vec!["b/x/x/x/x/x/y", "x/x/x/x/x", ""]))]
  #[test_case("a/{b/**/**/y,c/**/**/d}", "a/c/x/x/x/x/x/d" => Some(vec!["c/x/x/x/x/x/d", "", "x/x/x/x/x"]))]
  #[test_case("some/**/{a,b,c}/**/needle.txt", "some/path/a/to/the/needle.txt" => Some(vec!["path", "a", "to/the"]))]
  fn test_captures(glob: &'static str, path: &'static str) -> Option<Vec<&'static str>> {
    glob_match_with_captures(glob, path)
      .map(|v| v.into_iter().map(|capture| &path[capture]).collect())
  }

  // https://github.com/devongovett/glob-match/issues/1
  #[test_case("{*{??*{??**,Uz*zz}w**{*{**a,z***b*[!}w??*azzzzzzzz*!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!z[za,z&zz}w**z*z*}")]
  #[test_case("**** *{*{??*{??***\u{5} *{*{??*{??***\u{5},\0U\0}]*****\u{1},\0***\0,\0\0}w****,\0U\0}]*****\u{1},\0***\0,\0\0}w*****\u{1}***{}*.*\0\0*\0")]
  fn fuzz_tests(fuzz: &str) {
    assert!(!glob_match(fuzz, fuzz));
  }
}
