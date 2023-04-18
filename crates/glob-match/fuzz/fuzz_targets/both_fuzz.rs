#![no_main]

use fuzz_local::Data;
use glob_match::glob_match;
use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: Data<'_>| {
  _ = glob_match(data.pat, data.input);
});
