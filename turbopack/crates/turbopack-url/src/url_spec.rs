// Copyright 2013-2016 The rust-url developers.
//
// Licensed under the Apache License, Version 2.0 <LICENSE-APACHE or
// http://www.apache.org/licenses/LICENSE-2.0> or the MIT license
// <LICENSE-MIT or http://opensource.org/licenses/MIT>, at your
// option. This file may not be copied, modified, or distributed
// except according to those terms.

//! Percent encoding sets defined in the WHATWG URL spec.
//!
//! These are taken from the `url` crate:
//! https://github.com/servo/rust-url/blob/22b925f93ad505a830f1089538a9ed6f5fd90612/url/src/parser.rs#L19-L46

use percent_encoding::{AsciiSet, CONTROLS};

/// https://url.spec.whatwg.org/#fragment-percent-encode-set
pub const FRAGMENT: &AsciiSet = &CONTROLS.add(b' ').add(b'"').add(b'<').add(b'>').add(b'`');

/// https://url.spec.whatwg.org/#path-percent-encode-set
pub const PATH: &AsciiSet = &FRAGMENT.add(b'#').add(b'?').add(b'{').add(b'}');

/// https://url.spec.whatwg.org/#userinfo-percent-encode-set
pub const USERINFO: &AsciiSet = &PATH
    .add(b'/')
    .add(b':')
    .add(b';')
    .add(b'=')
    .add(b'@')
    .add(b'[')
    .add(b'\\')
    .add(b']')
    .add(b'^')
    .add(b'|');

pub const PATH_SEGMENT: &AsciiSet = &PATH.add(b'/').add(b'%');

/// An extended variant of [`PATH_SEGMENT`] for `http`, `https`, `ws`, `wss`, `ftp`, and `file` url
/// schemes.
///
/// The backslash (\) character is treated as a path separator in special URLs so it needs to be
/// additionally escaped in that case.
pub const SPECIAL_PATH_SEGMENT: &AsciiSet = &PATH_SEGMENT.add(b'\\');

// https://url.spec.whatwg.org/#query-state
pub const QUERY: &AsciiSet = &CONTROLS.add(b' ').add(b'"').add(b'#').add(b'<').add(b'>');

/// An extended variant of [`QUERY`] for `http`, `https`, `ws`, `wss`, `ftp`, and `file` url
/// schemes.
///
/// The backslash (\) character is treated as a path separator in special URLs so it needs to be
/// additionally escaped in that case.
pub const SPECIAL_QUERY: &AsciiSet = &QUERY.add(b'\'');
