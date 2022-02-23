use lazy_static::lazy_static;
use regex::Regex;

#[turbo_tasks::value(intern)]
#[derive(Hash, PartialEq, Eq, Clone, Debug)]
pub enum Request {
    Relative {
        path: String,
    },
    Module {
        module: String,
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
    Unknown {
        path: String,
    },
}

#[turbo_tasks::value_impl]
impl Request {
    #[turbo_tasks::constructor(intern)]
    pub fn parse(request: String) -> Self {
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
                static ref MODULE_PATH: Regex = Regex::new(r"^((?:@[^/]+/)?[^/]+)(.*)").unwrap();
            }
            if WINDOWS_PATH.is_match(&request) {
                return Request::Windows { path: request };
            }
            if let Some(caps) = URI_PATH.captures(&request) {
                if let (Some(protocol), Some(remainer)) = (caps.get(1), caps.get(2)) {
                    // TODO data uri
                    return Request::Uri {
                        protocol: protocol.as_str().to_string(),
                        remainer: remainer.as_str().to_string(),
                    };
                }
            }
            if let Some(caps) = MODULE_PATH.captures(&request) {
                if let (Some(module), Some(path)) = (caps.get(1), caps.get(2)) {
                    return Request::Module {
                        module: module.as_str().to_string(),
                        path: path.as_str().to_string(),
                    };
                }
            }
            Request::Unknown { path: request }
        }
    }
}
