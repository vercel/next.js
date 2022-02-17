use lazy_static::lazy_static;
use regex::Regex;

#[turbo_tasks::value]
#[derive(Hash, PartialEq, Eq, Clone, Debug)]
pub enum Request {
    Relative {
        path: String,
    },
    Module {
        path: String,
    },
    ServerRelative {
        path: String,
    },
    Windows {
        path: String,
    },
    Empty,
    PackageInternal {
        path: String,
    },
    DataUri {
        mimetype: String,
        attributes: String,
        base64: bool,
        encoded: String,
    },
    Uri {
        protocol: String,
        remainer: String,
    },
}

pub fn parse(request: String) -> Request {
    if request.is_empty() {
        Request::Empty
    } else if request.starts_with("/") {
        Request::ServerRelative { path: request }
    } else if request.starts_with("#") {
        Request::PackageInternal { path: request }
    } else if request.starts_with("./") || request.starts_with("../") {
        Request::Relative { path: request }
    } else {
        lazy_static! {
            static ref WINDOWS_PATH: Regex = Regex::new(r"^([A-Za-z]:\\|\\\\)").unwrap();
            static ref URI_PATH: Regex = Regex::new(r"^([^/\\]+:)(/.+)").unwrap();
        }
        if WINDOWS_PATH.is_match(&request) {
            return Request::Windows { path: request };
        }
        if let Some(caps) = URI_PATH.captures(&request) {
            if let (Some(protocol), Some(remainer)) = (caps.get(0), caps.get(1)) {
                // TODO data uri
                return Request::Uri {
                    protocol: protocol.as_str().to_string(),
                    remainer: remainer.as_str().to_string(),
                };
            }
        }
        Request::Module { path: request }
    }
}
