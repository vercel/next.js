use std::borrow::Cow;

pub fn encode_url(file_path: &str) -> String {
    file_path
        .split('/')
        .map(|s| urlencoding::encode(s))
        .intersperse(Cow::Borrowed("/"))
        .collect()
}
