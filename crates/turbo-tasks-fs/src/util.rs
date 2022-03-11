pub fn join_path(a: &str, b: &str) -> Option<String> {
    if a.is_empty() {
        normalize_path(b)
    } else if b.is_empty() {
        normalize_path(a)
    } else {
        normalize_path(&[a, "/", b].concat())
    }
}

pub fn normalize_path(str: &str) -> Option<String> {
    let mut seqments = Vec::new();
    for seqment in str.split('/') {
        match seqment {
            "." => {}
            ".." => {
                if seqments.pop().is_none() {
                    return None;
                }
            }
            seqment => {
                seqments.push(seqment);
            }
        }
    }
    let mut str = String::new();
    for seq in seqments.into_iter() {
        if !str.is_empty() && !str.ends_with("/") {
            str += "/";
        }
        str += seq;
    }
    Some(str)
}
