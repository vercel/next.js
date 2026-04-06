#![no_main]

use libfuzzer_sys::fuzz_target;
use turbo_rcstr::RcStr;

fuzz_target!(|data: &[u8]| {
    let Ok(s) = std::str::from_utf8(data) else {
        return;
    };

    let rc: RcStr = s.into();
    assert_eq!(rc.as_str(), s);

    let rc2 = rc.clone();
    assert_eq!(rc.as_str(), rc2.as_str());

    let owned = rc.clone().into_owned();
    assert_eq!(owned, s);

    let empty: RcStr = "".into();
    assert_eq!(empty.as_str(), "");

    let upper = rc.clone().map(|s| s.to_uppercase());
    assert_eq!(upper.as_str(), s.to_uppercase().as_str());

    use std::collections::HashSet;
    let mut set = HashSet::new();
    set.insert(rc.clone());
    assert!(set.contains(&rc2));
});