#![no_main]

use glob_match::glob_match;
use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &str| {
  _ = glob_match(data, data);
});
