use std::fmt::Display;

// These enums list well known types, which we use internally. Plugins might add
// custom types too.

// TODO when plugins are supported, replace u8 with a trait that defines the
// behavior.

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(Debug, Clone, PartialOrd, Ord, Hash)]
pub enum CommonJsReferenceSubType {
    Custom(u8),
    Undefined,
}

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(Debug, Clone, PartialOrd, Ord, Hash)]
pub enum EcmaScriptModulesReferenceSubType {
    Custom(u8),
    Undefined,
}

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(Debug, Clone, PartialOrd, Ord, Hash)]
pub enum CssReferenceSubType {
    AtImport,
    Custom(u8),
    Undefined,
}

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(Debug, Clone, PartialOrd, Ord, Hash)]
pub enum UrlReferenceSubType {
    EcmaScriptNewUrl,
    CssUrl,
    Custom(u8),
    Undefined,
}

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(Debug, Clone, PartialOrd, Ord, Hash)]
pub enum TypeScriptReferenceSubType {
    Custom(u8),
    Undefined,
}

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(Debug, Clone, PartialOrd, Ord, Hash)]
pub enum EntryReferenceSubType {
    Web,
    Page,
    AppRoute,
    Custom(u8),
    Undefined,
}

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(Debug, Clone, PartialOrd, Ord, Hash)]
pub enum ReferenceType {
    CommonJs(CommonJsReferenceSubType),
    EcmaScriptModules(EcmaScriptModulesReferenceSubType),
    Css(CssReferenceSubType),
    Url(UrlReferenceSubType),
    TypeScript(TypeScriptReferenceSubType),
    Entry(EntryReferenceSubType),
    Custom(u8),
    Undefined,
}

impl Display for ReferenceType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        // TODO print sub types
        let str = match self {
            ReferenceType::CommonJs(_) => "commonjs",
            ReferenceType::EcmaScriptModules(_) => "EcmaScript Modules",
            ReferenceType::Css(_) => "css",
            ReferenceType::Url(_) => "url",
            ReferenceType::TypeScript(_) => "typescript",
            ReferenceType::Entry(_) => "entry",
            ReferenceType::Custom(_) => todo!(),
            ReferenceType::Undefined => "undefined",
        };
        f.write_str(str)
    }
}

impl ReferenceType {
    pub fn includes(&self, other: &Self) -> bool {
        if self == other {
            return true;
        }
        match self {
            ReferenceType::CommonJs(sub_type) => {
                matches!(other, ReferenceType::CommonJs(_))
                    && matches!(sub_type, CommonJsReferenceSubType::Undefined)
            }
            ReferenceType::EcmaScriptModules(sub_type) => {
                matches!(other, ReferenceType::EcmaScriptModules(_))
                    && matches!(sub_type, EcmaScriptModulesReferenceSubType::Undefined)
            }
            ReferenceType::Css(sub_type) => {
                matches!(other, ReferenceType::Css(_))
                    && matches!(sub_type, CssReferenceSubType::Undefined)
            }
            ReferenceType::Url(sub_type) => {
                matches!(other, ReferenceType::Url(_))
                    && matches!(sub_type, UrlReferenceSubType::Undefined)
            }
            ReferenceType::TypeScript(sub_type) => {
                matches!(other, ReferenceType::TypeScript(_))
                    && matches!(sub_type, TypeScriptReferenceSubType::Undefined)
            }
            ReferenceType::Entry(sub_type) => {
                matches!(other, ReferenceType::Entry(_))
                    && matches!(sub_type, EntryReferenceSubType::Undefined)
            }
            ReferenceType::Custom(_) => {
                todo!()
            }
            ReferenceType::Undefined => true,
        }
    }
}
