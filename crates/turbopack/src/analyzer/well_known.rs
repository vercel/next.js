use swc_atoms::JsWord;
use swc_ecmascript::ast::Lit;
use url::Url;

use super::{JsValue, WellKnownFunctionKind, WellKnownObjectKind};

pub fn replace_well_known(value: JsValue) -> (JsValue, bool) {
    match value {
        JsValue::Call(box JsValue::WellKnownFunction(kind), args) => (
            well_known_function_call(
                kind,
                JsValue::Unknown(None, "this is not analysed yet"),
                args,
            ),
            true,
        ),
        JsValue::Member(box JsValue::WellKnownObject(kind), prop) => {
            (well_known_object_member(kind, prop), true)
        }
        JsValue::Member(box JsValue::WellKnownFunction(kind), prop) => {
            (well_known_function_member(kind, prop), true)
        }
        _ => (value, false),
    }
}

pub fn well_known_function_call(
    kind: WellKnownFunctionKind,
    _this: JsValue,
    args: Vec<JsValue>,
) -> JsValue {
    match kind {
        WellKnownFunctionKind::PathJoin => path_join(args),
        WellKnownFunctionKind::Import => JsValue::Unknown(
            Some(box JsValue::Call(
                box JsValue::WellKnownFunction(kind),
                args,
            )),
            "import() is not supported",
        ),
        WellKnownFunctionKind::Require => require(args),
        WellKnownFunctionKind::RequireResolve => JsValue::Unknown(
            Some(box JsValue::Call(
                box JsValue::WellKnownFunction(kind),
                args,
            )),
            "require.resolve() is not supported",
        ),
        WellKnownFunctionKind::PathToFileUrl => path_to_file_url(args),
        _ => JsValue::Unknown(
            Some(box JsValue::Call(
                box JsValue::WellKnownFunction(kind),
                args,
            )),
            "unsupported function",
        ),
    }
}

pub fn path_join(args: Vec<JsValue>) -> JsValue {
    // Currently we only support constants.
    if args.iter().any(|arg| !matches!(arg, JsValue::Constant(..))) {
        JsValue::Unknown(
            Some(box JsValue::Call(
                box JsValue::WellKnownFunction(WellKnownFunctionKind::PathJoin),
                args,
            )),
            "only constants are supported",
        )
    } else {
        let mut str_args = vec![];

        for arg in args.iter() {
            match arg {
                JsValue::Constant(v) => match v {
                    Lit::Str(v) => {
                        str_args.push(&*v.value);
                    }
                    _ => {
                        todo!()
                    }
                },
                _ => {}
            }
        }

        let joined = str_args.join("/");

        let mut res: Vec<&str> = vec![];

        for comp in joined.split("/") {
            match comp {
                "." => {}
                ".." => {
                    if let Some(last) = res.last() {
                        if &**last != ".." {
                            res.pop();
                            continue;
                        }
                    }

                    // leftmost `..`
                    res.push("..");
                }
                _ => {
                    res.push(comp);
                }
            }
        }

        res.join("/").into()
    }
}

pub fn require(args: Vec<JsValue>) -> JsValue {
    if args.len() == 1 {
        match &args[0] {
            JsValue::Constant(Lit::Str(s)) => JsValue::Module(s.value.clone()),
            _ => JsValue::Unknown(
                Some(box JsValue::Call(
                    box JsValue::WellKnownFunction(WellKnownFunctionKind::Require),
                    args,
                )),
                "only constant argument is supported",
            ),
        }
    } else {
        JsValue::Unknown(
            Some(box JsValue::Call(
                box JsValue::WellKnownFunction(WellKnownFunctionKind::Require),
                args,
            )),
            "only a single argument is supported",
        )
    }
}

pub fn path_to_file_url(args: Vec<JsValue>) -> JsValue {
    if args.len() == 1 {
        match &args[0] {
            JsValue::Constant(Lit::Str(path)) => Url::from_file_path(&*path.value)
                .map(JsValue::Url)
                .unwrap_or_else(|e| {
                    JsValue::Unknown(
                        Some(box JsValue::Call(
                            box JsValue::WellKnownFunction(WellKnownFunctionKind::PathToFileUrl),
                            args,
                        )),
                        "url not parseable",
                    )
                }),
            _ => JsValue::Unknown(
                Some(box JsValue::Call(
                    box JsValue::WellKnownFunction(WellKnownFunctionKind::PathToFileUrl),
                    args,
                )),
                "only constant argument is supported",
            ),
        }
    } else {
        JsValue::Unknown(
            Some(box JsValue::Call(
                box JsValue::WellKnownFunction(WellKnownFunctionKind::PathToFileUrl),
                args,
            )),
            "only a single argument is supported",
        )
    }
}

pub fn well_known_function_member(kind: WellKnownFunctionKind, prop: JsWord) -> JsValue {
    match (&kind, &*prop) {
        (WellKnownFunctionKind::Require, "resolve") => {
            JsValue::WellKnownFunction(WellKnownFunctionKind::RequireResolve)
        }
        _ => JsValue::Unknown(
            Some(box JsValue::Member(
                box JsValue::WellKnownFunction(kind),
                prop,
            )),
            "unsupported property on function",
        ),
    }
}

pub fn well_known_object_member(kind: WellKnownObjectKind, prop: JsWord) -> JsValue {
    match kind {
        WellKnownObjectKind::PathModule => path_module_member(prop),
        WellKnownObjectKind::FsModule => fs_module_member(prop),
        WellKnownObjectKind::UrlModule => url_module_member(prop),
        _ => JsValue::Unknown(
            Some(box JsValue::Member(
                box JsValue::WellKnownObject(kind),
                prop,
            )),
            "unsupported object kind",
        ),
    }
}

pub fn path_module_member(prop: JsWord) -> JsValue {
    match &*prop {
        "join" => JsValue::WellKnownFunction(WellKnownFunctionKind::PathJoin),
        _ => JsValue::Unknown(
            Some(box JsValue::Member(
                box JsValue::WellKnownObject(WellKnownObjectKind::PathModule),
                prop,
            )),
            "unsupported property on Node.js path module",
        ),
    }
}

pub fn fs_module_member(prop: JsWord) -> JsValue {
    match &*prop {
        "realpath" | "realpathSync" | "stat" | "statSync" | "existsSync" | "createReadStream"
        | "exists" | "open" | "openSync" | "readFile" | "readFileSync" => {
            JsValue::WellKnownFunction(WellKnownFunctionKind::FsReadMethod(prop))
        }
        "promises" => JsValue::WellKnownObject(WellKnownObjectKind::FsModule),
        _ => JsValue::Unknown(
            Some(box JsValue::Member(
                box JsValue::WellKnownObject(WellKnownObjectKind::FsModule),
                prop,
            )),
            "unsupported property on Node.js fs module",
        ),
    }
}

pub fn url_module_member(prop: JsWord) -> JsValue {
    match &*prop {
        "pathToFileURL" => JsValue::WellKnownFunction(WellKnownFunctionKind::PathToFileUrl),
        _ => JsValue::Unknown(
            Some(box JsValue::Member(
                box JsValue::WellKnownObject(WellKnownObjectKind::UrlModule),
                prop,
            )),
            "unsupported property on Node.js url module",
        ),
    }
}
