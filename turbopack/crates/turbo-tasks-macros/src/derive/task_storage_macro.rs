use proc_macro::TokenStream;
use quote::quote;
use syn::{
    Data, DeriveInput, Fields, Ident, Meta, Token, Type, parse_macro_input, punctuated::Punctuated,
    spanned::Spanned,
};

/// Derives the TaskStorage trait and generates optimized storage structures.
///
/// This macro analyzes field annotations and generates:
/// 1. A unified TypedStorage struct
/// 2. LazyField enum for lazy_vec fields
/// 3. Typed accessor methods on TypedStorage
/// 4. TaskStorageAccessors trait with accessor methods
/// 5. TaskFlags bitfield for boolean flags
///
/// # Field Attributes
///
/// - `#[task_storage(storage = "...")]` - Specifies the storage type:
///   - `direct` - Direct field access (e.g., `Option<OutputValue>`)
///   - `auto_set` - Uses AutoSet for small collections
///   - `auto_map` - Uses AutoMap for key-value pairs
///   - `counter_map` - Uses CounterMap for reference counting
///   - `indexed_vec` - Uses IndexedVec for direct index access
///
/// - `#[task_storage(category = "...")]` - Data vs Meta categorization:
///   - `data` - Frequently changed, bulk I/O
///   - `meta` - Rarely changed, small I/O
///
/// - `#[task_storage(lazy)]` - Field is lazily allocated in a Vec<LazyField> for memory efficiency.
///   Fields without `lazy` are stored inline.
///
/// - `#[task_storage(transient)]` - Field is not serialized
///
/// - `#[task_storage(flag)]` - Field is a boolean flag stored in a bitfield. The field type must be
///   `bool`. Flags are stored in a compact `TaskFlags` bitfield.
pub fn derive_task_storage(input: TokenStream) -> TokenStream {
    let input = parse_macro_input!(input as DeriveInput);

    match &input.data {
        Data::Struct(data_struct) => {
            let ident = &input.ident;

            // Parse field annotations
            let storage_fields = match &data_struct.fields {
                Fields::Named(fields) => fields
                    .named
                    .iter()
                    .map(parse_field_storage_attributes)
                    .collect::<Vec<_>>(),
                _ => {
                    return syn::Error::new(
                        input.span(),
                        "TaskStorage can only be derived for structs with named fields",
                    )
                    .to_compile_error()
                    .into();
                }
            };

            // Group fields by group name and category
            let grouped_fields = group_fields(&storage_fields);

            // Generate the implementation
            generate_task_storage_impl(ident, &grouped_fields)
        }
        _ => syn::Error::new(input.span(), "TaskStorage can only be derived for structs")
            .to_compile_error()
            .into(),
    }
}

/// Parsed field information with cached derived values.
///
/// This struct holds all information about a field extracted from its attributes,
/// along with pre-computed values like the PascalCase variant name.
#[derive(Debug, Clone)]
struct FieldInfo {
    /// The field's identifier (snake_case)
    field_name: Ident,
    /// The PascalCase variant name for use in LazyField enum
    variant_name: Ident,
    field_type: Type,
    storage_type: StorageType,
    category: Category,
    /// If true, field is lazily allocated in Vec<LazyField> instead of inline on TypedStorage
    lazy: bool,
    /// If true, field is not serialized (skipped in bincode)
    transient: bool,
    /// If true, field is a boolean flag stored in the TaskFlags bitfield
    flag: bool,
    /// If true, filter out values that reference transient tasks during encoding.
    /// For direct fields: skip encoding if value.is_transient() returns true.
    /// For collections: filter out entries where key/value is_transient() returns true.
    filter_transient: bool,
    /// If true, filter transient entries from nested collections in map values.
    /// Used for fields like `AutoMap<CellId, FxHashSet<TaskId>>` where the key doesn't
    /// need filtering but the set values do.
    filter_transient_values: bool,
}

impl FieldInfo {
    /// Generate the `TaskDataCategory` enum variant for `check_access` calls.
    ///
    /// Returns the appropriate category based on whether the field is transient
    /// and its data category (meta vs data).
    fn check_access_category(&self) -> proc_macro2::TokenStream {
        if self.transient {
            // Transient fields use TaskDataCategory::All
            quote! { crate::backend::TaskDataCategory::All }
        } else if self.category == Category::Meta {
            quote! { crate::backend::TaskDataCategory::Meta }
        } else {
            quote! { crate::backend::TaskDataCategory::Data }
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum StorageType {
    Direct,
    AutoSet,
    AutoMap,
    CounterMap,
    IndexedVec,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum Category {
    Data,
    Meta,
}

fn parse_field_storage_attributes(field: &syn::Field) -> FieldInfo {
    let field_name = field.ident.as_ref().unwrap().clone();
    let field_type = field.ty.clone();

    // Pre-compute the PascalCase variant name once
    let variant_name = syn::Ident::new(&to_pascal_case(&field_name.to_string()), field_name.span());

    // Default values
    let mut storage_type = StorageType::Direct;
    let mut category = Category::Data;
    let mut lazy = false;
    let mut transient = false;
    let mut flag = false;
    let mut filter_transient = false;
    let mut filter_transient_values = false;

    // Parse attributes
    for attr in &field.attrs {
        if !attr
            .path()
            .get_ident()
            .map(|ident| *ident == "task_storage")
            .unwrap_or_default()
        {
            continue;
        }

        let nested = match attr.parse_args_with(Punctuated::<Meta, Token![,]>::parse_terminated) {
            Ok(punctuated) => punctuated,
            Err(e) => {
                attr.meta
                    .span()
                    .unwrap()
                    .error(format!("failed to parse task_storage attribute: {e}"))
                    .emit();
                continue;
            }
        };

        for meta in nested {
            match &meta {
                Meta::NameValue(nv) => {
                    let Some(ident) = nv.path.get_ident() else {
                        continue;
                    };

                    if *ident == "storage"
                        && let syn::Expr::Lit(syn::ExprLit {
                            lit: syn::Lit::Str(lit_str),
                            ..
                        }) = &nv.value
                    {
                        storage_type = match lit_str.value().as_str() {
                            "direct" => StorageType::Direct,
                            "auto_set" => StorageType::AutoSet,
                            "auto_map" => StorageType::AutoMap,
                            "counter_map" => StorageType::CounterMap,
                            "indexed_vec" => StorageType::IndexedVec,
                            other => {
                                meta.span()
                                    .unwrap()
                                    .error(format!("unknown storage type: {other}"))
                                    .emit();
                                continue;
                            }
                        };
                    } else if *ident == "category"
                        && let syn::Expr::Lit(syn::ExprLit {
                            lit: syn::Lit::Str(lit_str),
                            ..
                        }) = &nv.value
                    {
                        category = match lit_str.value().as_str() {
                            "data" => Category::Data,
                            "meta" => Category::Meta,
                            other => {
                                meta.span()
                                    .unwrap()
                                    .error(format!("unknown category: {other}"))
                                    .emit();
                                continue;
                            }
                        };
                    }
                }
                Meta::Path(path) => {
                    if let Some(ident) = path.get_ident() {
                        if *ident == "lazy" {
                            lazy = true;
                        } else if *ident == "transient" {
                            transient = true;
                        } else if *ident == "flag" {
                            flag = true;
                        } else if *ident == "filter_transient" {
                            filter_transient = true;
                        } else if *ident == "filter_transient_values" {
                            filter_transient_values = true;
                        }
                    }
                }
                _ => {}
            }
        }
    }

    FieldInfo {
        field_name,
        variant_name,
        field_type,
        storage_type,
        category,
        lazy,
        transient,
        flag,
        filter_transient,
        filter_transient_values,
    }
}

#[derive(Debug)]
struct GroupedFields {
    /// Inline fields stored directly on TypedStorage (data category)
    inline_data_fields: Vec<FieldInfo>,
    /// Inline fields stored directly on TypedStorage (meta category)
    inline_meta_fields: Vec<FieldInfo>,
    /// Lazy fields stored in Vec<LazyField> (data category)
    lazy_data_fields: Vec<FieldInfo>,
    /// Lazy fields stored in Vec<LazyField> (meta category)
    lazy_meta_fields: Vec<FieldInfo>,
    /// Flag fields stored in TaskFlags bitfield (persisted flags)
    persisted_flag_fields: Vec<FieldInfo>,
    /// Flag fields stored in TaskFlags bitfield (transient flags)
    transient_flag_fields: Vec<FieldInfo>,
}

impl GroupedFields {
    /// Returns an iterator over all lazy fields (both data and meta categories).
    fn all_lazy_fields(&self) -> impl Iterator<Item = &FieldInfo> {
        self.lazy_data_fields
            .iter()
            .chain(self.lazy_meta_fields.iter())
    }

    /// Returns an iterator over persistent (non-transient) lazy meta fields.
    fn persistent_lazy_meta(&self) -> impl Iterator<Item = &FieldInfo> {
        self.lazy_meta_fields.iter().filter(|f| !f.transient)
    }

    /// Returns an iterator over persistent (non-transient) lazy data fields.
    fn persistent_lazy_data(&self) -> impl Iterator<Item = &FieldInfo> {
        self.lazy_data_fields.iter().filter(|f| !f.transient)
    }

    /// Returns an iterator over persistent (non-transient) inline meta fields.
    fn persistent_inline_meta(&self) -> impl Iterator<Item = &FieldInfo> {
        self.inline_meta_fields.iter().filter(|f| !f.transient)
    }

    /// Returns an iterator over persistent (non-transient) inline data fields.
    fn persistent_inline_data(&self) -> impl Iterator<Item = &FieldInfo> {
        self.inline_data_fields.iter().filter(|f| !f.transient)
    }
}

fn group_fields(fields: &[FieldInfo]) -> GroupedFields {
    let mut inline_data_fields = Vec::new();
    let mut inline_meta_fields = Vec::new();
    let mut lazy_data_fields = Vec::new();
    let mut lazy_meta_fields = Vec::new();
    let mut persisted_flag_fields = Vec::new();
    let mut transient_flag_fields = Vec::new();

    for field in fields {
        if field.flag {
            // Flag fields are stored in TaskFlags bitfield
            if field.transient {
                transient_flag_fields.push(field.clone());
            } else {
                persisted_flag_fields.push(field.clone());
            }
        } else if field.lazy {
            // Lazy fields are stored in Vec<LazyField>
            match field.category {
                Category::Data => lazy_data_fields.push(field.clone()),
                Category::Meta => lazy_meta_fields.push(field.clone()),
            }
        } else {
            // Non-lazy fields are stored inline on TypedStorage
            match field.category {
                Category::Data => inline_data_fields.push(field.clone()),
                Category::Meta => inline_meta_fields.push(field.clone()),
            }
        }
    }

    GroupedFields {
        inline_data_fields,
        inline_meta_fields,
        lazy_data_fields,
        lazy_meta_fields,
        persisted_flag_fields,
        transient_flag_fields,
    }
}

fn generate_task_storage_impl(_ident: &Ident, grouped_fields: &GroupedFields) -> TokenStream {
    // Generate TaskFlags bitfield if there are flag fields
    let task_flags_bitfield = generate_task_flags_bitfield(grouped_fields);

    // Generate LazyField enum for lazy fields
    let lazy_field_enum = generate_lazy_field_enum(grouped_fields);

    // Generate the unified TypedStorage struct
    let typed_storage_struct = generate_typed_storage_struct(grouped_fields);

    // Generate accessor methods
    let accessor_methods = generate_accessor_methods(grouped_fields);

    // Generate TaskStorageAccessors trait for all fields
    let accessors_trait = generate_task_storage_accessors_trait(grouped_fields);

    // Generate encode/decode methods for serialization
    let encode_decode_methods = generate_encode_decode_methods(grouped_fields);

    // Generate snapshot clone and restore methods
    let snapshot_restore_methods = generate_snapshot_restore_methods(grouped_fields);

    // Generate shrink_to_fit method
    let shrink_to_fit_method = generate_shrink_to_fit_method(grouped_fields);

    let expanded = quote! {
        // Generated TaskFlags bitfield
        #task_flags_bitfield

        // Generated LazyField enum
        #lazy_field_enum

        // Generated TypedStorage struct (unified)
        #typed_storage_struct

        // Generated accessor methods
        #accessor_methods

        // Generated encode/decode methods
        #encode_decode_methods

        // Generated snapshot clone and restore methods
        #snapshot_restore_methods

        // Generated shrink_to_fit method
        #shrink_to_fit_method

        // Generated TaskStorageAccessors trait
        #accessors_trait
    };

    TokenStream::from(expanded)
}

/// Generate the TaskFlags bitfield using the bitfield crate.
///
/// Persisted flags come first (bits 0-N), then transient flags (bits N+1-M).
/// This allows serializing only the persisted portion.
fn generate_task_flags_bitfield(grouped_fields: &GroupedFields) -> proc_macro2::TokenStream {
    let all_flags: Vec<_> = grouped_fields
        .persisted_flag_fields
        .iter()
        .chain(grouped_fields.transient_flag_fields.iter())
        .collect();

    // If no flags, don't generate the bitfield
    if all_flags.is_empty() {
        return quote! {};
    }

    let persisted_count = grouped_fields.persisted_flag_fields.len();

    // Generate bitfield accessors
    // Format: pub field_name, set_field_name: bit_index;
    let bitfield_accessors: Vec<_> = all_flags
        .iter()
        .enumerate()
        .map(|(i, field)| {
            let field_name = &field.field_name;
            let set_name = syn::Ident::new(
                &format!("set_{}", field_name),
                proc_macro2::Span::call_site(),
            );
            // bitfield crate uses usize for bit indices, but literal integers work fine
            let bit_idx = i;
            quote! {
                pub #field_name, #set_name: #bit_idx
            }
        })
        .collect();

    // Generate the persisted bits mask
    let persisted_mask = (1u16 << persisted_count) - 1;

    quote! {
        bitfield::bitfield! {
            /// Combined bitfield for task flags.
            /// Persisted flags are in the lower bits (0 to N-1).
            /// Transient flags are in the higher bits (N and above).
            #[derive(Clone, Default)]
            pub struct TaskFlags(u16);
            impl Debug;

            #(#bitfield_accessors;)*
        }

        impl TaskFlags {
            /// Mask for persisted flags (lower bits only)
            pub const PERSISTED_MASK: u16 = #persisted_mask;

            /// Get the raw bits value
            pub fn bits(&self) -> u16 {
                self.0
            }

            /// Get only the persisted bits (for serialization)
            pub fn persisted_bits(&self) -> u16 {
                self.0 & Self::PERSISTED_MASK
            }

            /// Set bits from a raw value, preserving transient flags
            pub fn set_persisted_bits(&mut self, bits: u16) {
                self.0 = (self.0 & !Self::PERSISTED_MASK) | (bits & Self::PERSISTED_MASK);
            }

            /// Create from raw bits (for deserialization)
            pub fn from_bits(bits: u16) -> Self {
                Self(bits)
            }
        }
    }
}

/// Generate the LazyField enum containing all lazy fields
fn generate_lazy_field_enum(grouped_fields: &GroupedFields) -> proc_macro2::TokenStream {
    let all_lazy_fields: Vec<_> = grouped_fields.all_lazy_fields().collect();

    // If no lazy_vec fields, don't generate the enum
    if all_lazy_fields.is_empty() {
        return quote! {};
    }

    // Generate enum variants
    let variants: Vec<_> = all_lazy_fields
        .iter()
        .map(|field| {
            let variant_name = &field.variant_name;
            let field_type = &field.field_type;
            quote! {
                #variant_name(#field_type)
            }
        })
        .collect();

    // Generate is_empty method arms
    let is_empty_arms: Vec<_> = all_lazy_fields
        .iter()
        .map(|field| {
            let variant_name = &field.variant_name;
            // For collection types, check if empty; for direct types, presence means non-empty
            match field.storage_type {
                StorageType::Direct => {
                    // For direct types, presence of the variant means it's non-empty
                    // (the Vec<LazyField> provides optionality, not Option<T>)
                    quote! {
                        LazyField::#variant_name(_) => false
                    }
                }
                _ => {
                    // For collection types, delegate to is_empty()
                    quote! {
                        LazyField::#variant_name(v) => v.is_empty()
                    }
                }
            }
        })
        .collect();

    // Generate is_persistent (transient check) method arms
    let is_persistent_arms: Vec<_> = all_lazy_fields
        .iter()
        .map(|field| {
            let variant_name = &field.variant_name;
            let is_persistent = !field.transient;
            quote! {
                LazyField::#variant_name(_) => #is_persistent
            }
        })
        .collect();

    // Generate is_meta/is_data method arms
    let is_meta_arms: Vec<_> = all_lazy_fields
        .iter()
        .map(|field| {
            let variant_name = &field.variant_name;
            let is_meta = field.category == Category::Meta;
            quote! {
                LazyField::#variant_name(_) => #is_meta
            }
        })
        .collect();

    quote! {
        /// All lazily-allocated fields stored in a single Vec.
        /// Fields are stored directly (unboxed) to avoid allocation overhead.
        #[derive(Debug, Clone)]
        pub enum LazyField {
            #(#variants),*
        }

        impl LazyField {
            /// Returns true if this field is empty (can be removed from the Vec)
            pub fn is_empty(&self) -> bool {
                match self {
                    #(#is_empty_arms),*
                }
            }

            /// Returns true if this field should be persisted (not transient)
            pub fn is_persistent(&self) -> bool {
                match self {
                    #(#is_persistent_arms),*
                }
            }

            /// Returns true if this field belongs to the meta category
            pub fn is_meta(&self) -> bool {
                match self {
                    #(#is_meta_arms),*
                }
            }

            /// Returns true if this field belongs to the data category
            pub fn is_data(&self) -> bool {
                !self.is_meta()
            }
        }
    }
}

/// Generate the unified TypedStorage struct with all fields directly on it.
fn generate_typed_storage_struct(grouped_fields: &GroupedFields) -> proc_macro2::TokenStream {
    let has_lazy = grouped_fields.all_lazy_fields().next().is_some();
    let has_flags = !grouped_fields.persisted_flag_fields.is_empty()
        || !grouped_fields.transient_flag_fields.is_empty();

    // Collect all field definitions from both categories
    let mut field_defs = Vec::new();

    // Add inline fields directly on TypedStorage
    // Note: No bincode attributes since we don't derive Encode/Decode (manual serialization)
    for field in grouped_fields
        .inline_data_fields
        .iter()
        .chain(grouped_fields.inline_meta_fields.iter())
    {
        let field_name = &field.field_name;
        let field_type = &field.field_type;
        field_defs.push(quote! {
            pub #field_name: #field_type
        });
    }

    // Add flags bitfield if needed
    let flags_field = if has_flags {
        quote! {
            /// Combined bitfield for boolean flags (persisted + transient)
            pub flags: TaskFlags,
        }
    } else {
        quote! {}
    };

    // Add lazy vec field if needed
    // Note: Serialization is handled manually via encode_data/encode_meta methods
    let lazy_field = if has_lazy {
        quote! {
            /// Lazily-allocated fields stored in a single Vec for memory efficiency
            pub lazy: Vec<LazyField>,
        }
    } else {
        quote! {}
    };

    let lazy_helpers = if has_lazy {
        quote! {
            /// Find a lazy field by predicate (immutable)
            pub fn find_lazy<T>(&self, extract: impl Fn(&LazyField) -> Option<&T>) -> Option<&T> {
                self.lazy.iter().find_map(extract)
            }

            /// Find a lazy field by predicate (mutable)
            pub fn find_lazy_mut<T>(&mut self, extract: impl Fn(&mut LazyField) -> Option<&mut T>) -> Option<&mut T> {
                self.lazy.iter_mut().find_map(extract)
            }

            /// Get or create a lazy field, returning a mutable reference.
            ///
            /// Uses a single `extract` closure that serves as both the matcher (by returning Some/None)
            /// and the value extractor. The closure is first used immutably to find the field,
            /// then mutably to extract the value.
            pub fn get_or_create_lazy<T>(
                &mut self,
                extract: impl for<'a> Fn(&'a mut LazyField) -> Option<&'a mut T>,
                create: impl FnOnce() -> LazyField,
            ) -> &mut T {
                // Find the index of matching field
                let idx = self.lazy.iter_mut().position(|f| extract(f).is_some());
                if let Some(idx) = idx {
                    extract(&mut self.lazy[idx]).unwrap()
                } else {
                    self.lazy.push(create());
                    extract(self.lazy.last_mut().unwrap()).unwrap()
                }
            }

            /// Remove a lazy field at index if it's empty
            pub fn remove_if_empty(&mut self, idx: usize) {
                if self.lazy[idx].is_empty() {
                    self.lazy.swap_remove(idx);
                }
            }
        }
    } else {
        quote! {}
    };

    // Note: We don't derive bincode::Encode/Decode here since serialization
    // will be handled manually via encode_data/encode_meta/decode_data/decode_meta methods
    quote! {
        /// Unified typed storage containing all task fields.
        /// This is designed to be embedded in the actual InnerStorage for incremental migration.
        #[derive(Debug, Clone, Default)]
        pub struct TypedStorage {
            #(#field_defs,)*
            #flags_field
            #lazy_field
        }

        impl TypedStorage {
            pub fn new() -> Self {
                Self::default()
            }

            #lazy_helpers
        }
    }
}

fn generate_accessor_methods(grouped_fields: &GroupedFields) -> proc_macro2::TokenStream {
    let mut methods = proc_macro2::TokenStream::new();

    // Note: Inline field accessors are not generated on TypedStorage itself.
    // All field access should go through the TaskStorageAccessors trait for correctness
    // (check_access validation and modification tracking).
    //
    // The only exception is lazy field accessors which are used by some helper methods
    // that need to operate on TypedStorage directly after calling typed_mut().

    // Generate methods for lazy_vec fields only
    for field in grouped_fields
        .lazy_data_fields
        .iter()
        .chain(grouped_fields.lazy_meta_fields.iter())
    {
        methods.extend(generate_lazy_field_accessors(field));
    }

    quote! {
        impl TypedStorage {
            #methods
        }
    }
}

/// Generate accessor methods for a lazy field (stored in Vec<LazyField>)
fn generate_lazy_field_accessors(field: &FieldInfo) -> proc_macro2::TokenStream {
    let field_name = &field.field_name;
    let field_type = &field.field_type;
    let variant_name = &field.variant_name;

    match field.storage_type {
        StorageType::Direct => {
            // For Option<T> types with lazy_vec, generate Option-like accessors
            let get_name = syn::Ident::new(
                &format!("get_{}", field_name),
                proc_macro2::Span::call_site(),
            );
            let set_name = syn::Ident::new(
                &format!("set_{}", field_name),
                proc_macro2::Span::call_site(),
            );
            let take_name = syn::Ident::new(
                &format!("take_{}", field_name),
                proc_macro2::Span::call_site(),
            );

            quote! {
                pub fn #get_name(&self) -> Option<&#field_type> {
                    self.find_lazy(|f| match f {
                        LazyField::#variant_name(v) => Some(v),
                        _ => None,
                    })
                }

                pub fn #set_name(&mut self, value: #field_type) {
                    // Remove existing if any, then add new
                    self.lazy.retain(|f| !matches!(f, LazyField::#variant_name(_)));
                    self.lazy.push(LazyField::#variant_name(value));
                }

                pub fn #take_name(&mut self) -> Option<#field_type> {
                    let idx = self.lazy.iter().position(|f| matches!(f, LazyField::#variant_name(_)))?;
                    match self.lazy.swap_remove(idx) {
                        LazyField::#variant_name(v) => Some(v),
                        _ => unreachable!(),
                    }
                }
            }
        }
        _ => {
            // For collection types, generate get (Option<&T>) and get_mut (&mut T)
            let ref_name =
                syn::Ident::new(&format!("{}", field_name), proc_macro2::Span::call_site());
            let mut_name = syn::Ident::new(
                &format!("{}_mut", field_name),
                proc_macro2::Span::call_site(),
            );

            quote! {
                pub fn #ref_name(&self) -> Option<&#field_type> {
                    self.find_lazy(|f| match f {
                        LazyField::#variant_name(v) => Some(v),
                        _ => None,
                    })
                }

                pub fn #mut_name(&mut self) -> &mut #field_type {
                    self.get_or_create_lazy(
                        |f| match f {
                            LazyField::#variant_name(v) => Some(v),
                            _ => None,
                        },
                        || LazyField::#variant_name(Default::default()),
                    )
                }
            }
        }
    }
}

/// Generates the TaskStorageAccessors trait with accessor methods for all fields.
///
/// This trait provides:
/// 1. Required methods: `typed()` and `typed_mut(category)` that implementors must provide
/// 2. Provided methods: accessor methods for all fields
///
/// The trait is designed to be used with TaskGuard, which implements the required methods
/// and gets all the accessor methods for free.
fn generate_task_storage_accessors_trait(
    grouped_fields: &GroupedFields,
) -> proc_macro2::TokenStream {
    let mut trait_methods = proc_macro2::TokenStream::new();

    // Generate accessor methods for inline fields
    for field in &grouped_fields.inline_data_fields {
        trait_methods.extend(generate_inline_trait_accessor_methods(field, "data"));
    }
    for field in &grouped_fields.inline_meta_fields {
        trait_methods.extend(generate_inline_trait_accessor_methods(field, "meta"));
    }

    // Generate accessor methods for lazy_vec fields
    for field in &grouped_fields.lazy_data_fields {
        trait_methods.extend(generate_lazy_trait_accessor_methods(field));
    }
    for field in &grouped_fields.lazy_meta_fields {
        trait_methods.extend(generate_lazy_trait_accessor_methods(field));
    }

    // Generate accessor methods for flag fields (all flags are meta category)
    for field in grouped_fields
        .persisted_flag_fields
        .iter()
        .chain(grouped_fields.transient_flag_fields.iter())
    {
        trait_methods.extend(generate_flag_trait_accessor_methods(field));
    }

    quote! {
        /// Trait for typed storage accessors.
        ///
        /// This trait is auto-generated by the TaskStorage macro.
        /// Implementors only need to provide `typed()`, `typed_mut()`, and `check_access()` methods,
        /// and all accessor methods are provided automatically.
        ///
        /// This is designed to work with TaskGuard.
        pub trait TaskStorageAccessors {
            /// Access the typed storage (read-only)
            fn typed(&self) -> &TypedStorage;

            /// Access the typed storage (mutable) and track modification for the given category.
            /// The category parameter tells the implementation which category is being modified
            /// so it can track dirty state appropriately.
            fn typed_mut(&mut self, category: crate::backend::storage::SpecificTaskDataCategory) -> &mut TypedStorage;

            /// Verify that the task was accessed with the correct category before reading/writing.
            ///
            /// This is a debug assertion that catches bugs where code tries to access data
            /// without having restored it from storage first.
            ///
            /// The category parameter uses `TaskDataCategory`:
            /// - `Data` or `Meta`: Checks that the task was accessed with that category
            /// - `All`: Used for transient data - no check is performed
            ///
            /// Implementors should check that the provided category matches how the task was accessed.
            /// The default implementation does nothing (for non-TaskGuard uses).
            #[inline]
            fn check_access(&self, _category: crate::backend::TaskDataCategory) {
                // Default: no checking. TaskGuardImpl overrides this with actual checks.
            }

            /// Shrink all collection fields to fit their current contents.
            ///
            /// This releases excess memory from hash maps and hash sets that may have
            /// grown larger than needed during task execution.
            ///
            /// Note: This method modifies both meta and data categories, so implementations
            /// should track modifications for both categories.
            fn shrink_to_fit(&mut self) {
                // Track modifications for both categories since collections exist in both
                self.typed_mut(crate::backend::storage::SpecificTaskDataCategory::Meta);
                self.typed_mut(crate::backend::storage::SpecificTaskDataCategory::Data)
                    .shrink_to_fit();
            }

            #trait_methods
        }
    }
}

/// Generates trait accessor methods for an inline field (stored directly on TypedStorage)
fn generate_inline_trait_accessor_methods(
    field: &FieldInfo,
    category: &str,
) -> proc_macro2::TokenStream {
    let field_name = &field.field_name;
    let field_type = &field.field_type;

    // Determine the category enum variant for typed_mut (SpecificTaskDataCategory)
    let specific_category_variant = if category == "data" {
        quote! { crate::backend::storage::SpecificTaskDataCategory::Data }
    } else {
        quote! { crate::backend::storage::SpecificTaskDataCategory::Meta }
    };

    let check_access_category = field.check_access_category();

    match field.storage_type {
        StorageType::Direct => {
            // For Option<T> fields, generate get_ref, has_, set_, take_ methods
            let get_ref_name = syn::Ident::new(
                &format!("get_{}_ref", field_name),
                proc_macro2::Span::call_site(),
            );
            let has_name = syn::Ident::new(
                &format!("has_{}", field_name),
                proc_macro2::Span::call_site(),
            );
            let set_name = syn::Ident::new(
                &format!("set_{}", field_name),
                proc_macro2::Span::call_site(),
            );
            let take_name = syn::Ident::new(
                &format!("take_{}", field_name),
                proc_macro2::Span::call_site(),
            );

            // Extract inner type from Option<T>
            let inner_type = extract_option_inner_type(field_type);

            quote! {
                /// Get a reference to the field value (if present)
                fn #get_ref_name(&self) -> Option<&#inner_type> {
                    self.check_access(#check_access_category);
                    self.typed().#field_name.as_ref()
                }

                /// Check if this field has a value
                fn #has_name(&self) -> bool {
                    self.check_access(#check_access_category);
                    self.typed().#field_name.is_some()
                }

                /// Set the field value, returning the old value if present
                fn #set_name(&mut self, value: #inner_type) -> Option<#inner_type> {
                    self.check_access(#check_access_category);
                    self.typed_mut(#specific_category_variant).#field_name.replace(value)
                }

                /// Take the field value, leaving None
                ///
                /// Only tracks modification if there was a value to take.
                fn #take_name(&mut self) -> Option<#inner_type> {
                    self.check_access(#check_access_category);
                    // Only track modification if there's actually something to take
                    if self.typed().#field_name.is_some() {
                        self.typed_mut(#specific_category_variant).#field_name.take()
                    } else {
                        None
                    }
                }
            }
        }
        StorageType::AutoSet
        | StorageType::AutoMap
        | StorageType::CounterMap
        | StorageType::IndexedVec => {
            // For collection types, generate immutable and mutable accessors
            let ref_name =
                syn::Ident::new(&format!("{}", field_name), proc_macro2::Span::call_site());
            let mut_name = syn::Ident::new(
                &format!("{}_mut", field_name),
                proc_macro2::Span::call_site(),
            );

            quote! {
                /// Get a reference to the collection
                fn #ref_name(&self) -> &#field_type {
                    self.check_access(#check_access_category);
                    &self.typed().#field_name
                }

                /// Get a mutable reference to the collection
                fn #mut_name(&mut self) -> &mut #field_type {
                    self.check_access(#check_access_category);
                    &mut self.typed_mut(#specific_category_variant).#field_name
                }
            }
        }
    }
}

/// Extract the inner type from Option<T>, or return the type as-is if not Option
fn extract_option_inner_type(ty: &Type) -> proc_macro2::TokenStream {
    // Try to parse as Option<T> and extract T
    if let Type::Path(type_path) = ty
        && let Some(segment) = type_path.path.segments.last()
        && segment.ident == "Option"
        && let syn::PathArguments::AngleBracketed(args) = &segment.arguments
        && let Some(syn::GenericArgument::Type(inner)) = args.args.first()
    {
        return quote! { #inner };
    }

    // Not Option<T>, return the type as-is
    quote! { #ty }
}

fn capitalize(s: &str) -> String {
    let mut c = s.chars();
    match c.next() {
        None => String::new(),
        Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
    }
}

/// Convert snake_case to PascalCase (e.g., "in_progress" -> "InProgress")
fn to_pascal_case(s: &str) -> String {
    s.split('_').map(capitalize).collect::<String>()
}

/// Generate trait accessor methods for a lazy field (stored in Vec<LazyField>)
fn generate_lazy_trait_accessor_methods(field: &FieldInfo) -> proc_macro2::TokenStream {
    let field_name = &field.field_name;
    let field_type = &field.field_type;
    let variant_name = &field.variant_name;

    // Determine the category for typed_mut (SpecificTaskDataCategory)
    let specific_category_variant = if field.category == Category::Meta {
        quote! { crate::backend::storage::SpecificTaskDataCategory::Meta }
    } else {
        quote! { crate::backend::storage::SpecificTaskDataCategory::Data }
    };

    let check_access_category = field.check_access_category();

    match field.storage_type {
        StorageType::Direct => {
            // For lazy direct fields, optionality comes from Vec<LazyField> presence.
            // The field type should NOT be Option<T> - use bare T instead.
            let get_ref_name = syn::Ident::new(
                &format!("get_{}_ref", field_name),
                proc_macro2::Span::call_site(),
            );
            let has_name = syn::Ident::new(
                &format!("has_{}", field_name),
                proc_macro2::Span::call_site(),
            );
            let set_name = syn::Ident::new(
                &format!("set_{}", field_name),
                proc_macro2::Span::call_site(),
            );
            let take_name = syn::Ident::new(
                &format!("take_{}", field_name),
                proc_macro2::Span::call_site(),
            );

            quote! {
                /// Get a reference to the field value (if present in lazy storage)
                fn #get_ref_name(&self) -> Option<&#field_type> {
                    self.check_access(#check_access_category);
                    self.typed().find_lazy(|f| match f {
                        LazyField::#variant_name(v) => Some(v),
                        _ => None,
                    })
                }

                /// Check if this field has a value (present in lazy storage)
                fn #has_name(&self) -> bool {
                    self.check_access(#check_access_category);
                    self.typed().lazy.iter().any(|f| matches!(f, LazyField::#variant_name(_)))
                }

                /// Set the field value, returning the old value if present
                fn #set_name(&mut self, value: #field_type) -> Option<#field_type> {
                    self.check_access(#check_access_category);
                    let typed = self.typed_mut(#specific_category_variant);
                    // Find and remove existing
                    let old = typed.lazy.iter().position(|f| matches!(f, LazyField::#variant_name(_)))
                        .map(|idx| {
                            match typed.lazy.swap_remove(idx) {
                                LazyField::#variant_name(v) => v,
                                _ => unreachable!(),
                            }
                        });
                    typed.lazy.push(LazyField::#variant_name(value));
                    old
                }

                /// Take the field value, removing it from lazy storage
                ///
                /// Only tracks modification if there was a value to take.
                fn #take_name(&mut self) -> Option<#field_type> {
                    self.check_access(#check_access_category);
                    // Check if there's a value to take before calling typed_mut
                    let has_value = self.typed().lazy.iter()
                        .any(|f| matches!(f, LazyField::#variant_name(_)));
                    if !has_value {
                        return None;
                    }
                    let typed = self.typed_mut(#specific_category_variant);
                    typed.lazy.iter().position(|f| matches!(f, LazyField::#variant_name(_)))
                        .map(|idx| {
                            match typed.lazy.swap_remove(idx) {
                                LazyField::#variant_name(v) => v,
                                _ => unreachable!(),
                            }
                        })
                }
            }
        }
        _ => {
            // For collection types, generate get (Option<&T>) and get_mut (&mut T)
            let ref_name =
                syn::Ident::new(&format!("{}", field_name), proc_macro2::Span::call_site());
            let mut_name = syn::Ident::new(
                &format!("{}_mut", field_name),
                proc_macro2::Span::call_site(),
            );

            quote! {
                /// Get a reference to the collection (may be None if not allocated)
                fn #ref_name(&self) -> Option<&#field_type> {
                    self.check_access(#check_access_category);
                    self.typed().find_lazy(|f| match f {
                        LazyField::#variant_name(v) => Some(v),
                        _ => None,
                    })
                }

                /// Get a mutable reference to the collection (allocates if needed)
                fn #mut_name(&mut self) -> &mut #field_type {
                    self.check_access(#check_access_category);
                    let typed = self.typed_mut(#specific_category_variant);
                    typed.get_or_create_lazy(
                        |f| match f {
                            LazyField::#variant_name(v) => Some(v),
                            _ => None,
                        },
                        || LazyField::#variant_name(Default::default()),
                    )
                }
            }
        }
    }
}

/// Generates trait accessor methods for a flag field (stored in TaskFlags bitfield)
fn generate_flag_trait_accessor_methods(field: &FieldInfo) -> proc_macro2::TokenStream {
    let field_name = &field.field_name;
    let set_name = syn::Ident::new(
        &format!("set_{}", field_name),
        proc_macro2::Span::call_site(),
    );

    // All flags modify the meta category (SpecificTaskDataCategory)
    let specific_category_variant =
        quote! { crate::backend::storage::SpecificTaskDataCategory::Meta };

    let check_access_category = field.check_access_category();

    quote! {
        /// Get the flag value
        fn #field_name(&self) -> bool {
            self.check_access(#check_access_category);
            self.typed().flags.#field_name()
        }

        /// Set the flag value
        ///
        /// Only tracks modification if the value actually changes.
        fn #set_name(&mut self, value: bool) {
            self.check_access(#check_access_category);
            // Only track modification if the value actually changes
            if self.typed().flags.#field_name() != value {
                self.typed_mut(#specific_category_variant).flags.#set_name(value);
            }
        }
    }
}

/// Generate encode/decode methods for TypedStorage serialization.
///
/// Generates four methods:
/// - `encode_meta<E>(&self, encoder: &mut E)` - Encode meta category fields
/// - `encode_data<E>(&self, encoder: &mut E)` - Encode data category fields
/// - `decode_meta<D>(&mut self, decoder: &mut D)` - Decode meta category fields
/// - `decode_data<D>(&mut self, decoder: &mut D)` - Decode data category fields
///
/// Only persistent (non-transient) fields are encoded/decoded.
fn generate_encode_decode_methods(grouped_fields: &GroupedFields) -> proc_macro2::TokenStream {
    // Collect persistent fields by category using helpers
    let persistent_inline_meta: Vec<_> = grouped_fields.persistent_inline_meta().collect();
    let persistent_inline_data: Vec<_> = grouped_fields.persistent_inline_data().collect();
    let persistent_lazy_meta: Vec<_> = grouped_fields.persistent_lazy_meta().collect();
    let persistent_lazy_data: Vec<_> = grouped_fields.persistent_lazy_data().collect();

    let has_flags = !grouped_fields.persisted_flag_fields.is_empty();

    // Generate encode_meta body
    let encode_meta_inline: Vec<_> = persistent_inline_meta
        .iter()
        .map(|field| generate_encode_inline_field(field))
        .collect();

    let encode_meta_flags = if has_flags {
        quote! {
            // Encode only the persisted flag bits
            let persisted_flags = self.flags.persisted_bits();
            bincode::Encode::encode(&persisted_flags, encoder)?;
        }
    } else {
        quote! {}
    };

    let encode_meta_lazy = generate_encode_lazy_fields(&persistent_lazy_meta);

    // Generate encode_data body
    let encode_data_inline: Vec<_> = persistent_inline_data
        .iter()
        .map(|field| generate_encode_inline_field(field))
        .collect();

    let encode_data_lazy = generate_encode_lazy_fields(&persistent_lazy_data);

    // Generate decode_meta body
    let decode_meta_inline: Vec<_> = persistent_inline_meta
        .iter()
        .map(|field| {
            let field_name = &field.field_name;
            quote! {
                self.#field_name = bincode::Decode::decode(decoder)?;
            }
        })
        .collect();

    let decode_meta_flags = if has_flags {
        quote! {
            // Decode only the persisted flag bits, preserving transient bits
            let persisted_flags: u16 = bincode::Decode::decode(decoder)?;
            self.flags.set_persisted_bits(persisted_flags);
        }
    } else {
        quote! {}
    };

    let decode_meta_lazy = generate_decode_lazy_fields(&persistent_lazy_meta);

    // Generate decode_data body
    let decode_data_inline: Vec<_> = persistent_inline_data
        .iter()
        .map(|field| {
            let field_name = &field.field_name;
            quote! {
                self.#field_name = bincode::Decode::decode(decoder)?;
            }
        })
        .collect();

    let decode_data_lazy = generate_decode_lazy_fields(&persistent_lazy_data);

    quote! {
        impl TypedStorage {
            /// Encode meta category fields directly to bincode.
            /// Only persistent (non-transient) fields are encoded.
            pub fn encode_meta<E: bincode::enc::Encoder>(
                &self,
                encoder: &mut E,
            ) -> Result<(), bincode::error::EncodeError> {
                // Encode inline meta fields
                #(#encode_meta_inline)*

                // Encode flags (persisted bits only)
                #encode_meta_flags

                // Encode lazy meta fields
                #encode_meta_lazy

                Ok(())
            }

            /// Encode data category fields directly to bincode.
            /// Only persistent (non-transient) fields are encoded.
            pub fn encode_data<E: bincode::enc::Encoder>(
                &self,
                encoder: &mut E,
            ) -> Result<(), bincode::error::EncodeError> {
                // Encode inline data fields
                #(#encode_data_inline)*

                // Encode lazy data fields
                #encode_data_lazy

                Ok(())
            }

            /// Decode meta category fields from bincode.
            /// Only persistent (non-transient) fields are decoded.
            pub fn decode_meta<D: bincode::de::Decoder>(
                &mut self,
                decoder: &mut D,
            ) -> Result<(), bincode::error::DecodeError> {
                // Decode inline meta fields
                #(#decode_meta_inline)*

                // Decode flags (persisted bits only)
                #decode_meta_flags

                // Decode lazy meta fields
                #decode_meta_lazy

                Ok(())
            }

            /// Decode data category fields from bincode.
            /// Only persistent (non-transient) fields are decoded.
            pub fn decode_data<D: bincode::de::Decoder>(
                &mut self,
                decoder: &mut D,
            ) -> Result<(), bincode::error::DecodeError> {
                // Decode inline data fields
                #(#decode_data_inline)*

                // Decode lazy data fields
                #decode_data_lazy

                Ok(())
            }
        }
    }
}

/// Sentinel byte marking the end of lazy fields in serialization.
/// Must be a value that cannot be a valid discriminant (discriminants start at 0).
const LAZY_FIELD_SENTINEL: u8 = 0x00;

/// Generate code to encode a value with transient filtering based on field configuration.
///
/// This is a shared helper used by both inline field encoding and lazy field encoding.
/// The `value_ref` parameter is an expression that evaluates to a *reference* to the value
/// (e.g., `&self.field_name` for inline fields, or `data` for lazy fields where `data`
/// is already a reference from the match arm).
fn generate_encode_value(
    field: &FieldInfo,
    value_ref: proc_macro2::TokenStream,
) -> proc_macro2::TokenStream {
    // Handle filter_transient_values for AutoMap with set values
    if field.filter_transient_values {
        return match field.storage_type {
            StorageType::AutoMap => {
                // For maps with set values, filter transient entries from the inner sets
                quote! {
                    {
                        // Count entries where filtered set is non-empty
                        let count = (#value_ref).iter()
                            .filter(|(_, v)| v.iter().any(|item| !item.is_transient()))
                            .count();
                        bincode::Encode::encode(&count, encoder)?;
                        for (key, value) in #value_ref {
                            let filtered: Vec<_> = value.iter()
                                .filter(|item| !item.is_transient())
                                .collect();
                            if !filtered.is_empty() {
                                bincode::Encode::encode(key, encoder)?;
                                bincode::Encode::encode(&filtered.len(), encoder)?;
                                for item in filtered {
                                    bincode::Encode::encode(item, encoder)?;
                                }
                            }
                        }
                    }
                }
            }
            _ => {
                // filter_transient_values only makes sense for AutoMap
                quote! {
                    bincode::Encode::encode(#value_ref, encoder)?;
                }
            }
        };
    }

    if !field.filter_transient {
        // No filtering needed, just encode normally
        return quote! {
            bincode::Encode::encode(#value_ref, encoder)?;
        };
    }

    // Generate filtering code based on storage type
    match field.storage_type {
        StorageType::Direct => {
            // For Option<T>, check if the value is transient and encode None if so
            quote! {
                {
                    let filtered_value = (#value_ref).as_ref().filter(|v| !v.is_transient());
                    bincode::Encode::encode(&filtered_value, encoder)?;
                }
            }
        }
        StorageType::AutoSet => {
            // For AutoSet<K>, filter out transient keys
            quote! {
                {
                    let count = (#value_ref).iter().filter(|k| !k.is_transient()).count();
                    bincode::Encode::encode(&count, encoder)?;
                    for key in (#value_ref).iter().filter(|k| !k.is_transient()) {
                        bincode::Encode::encode(key, encoder)?;
                    }
                }
            }
        }
        StorageType::CounterMap => {
            // For counter maps, filter out entries with transient keys
            // (values are just counts, not references)
            quote! {
                {
                    let count = (#value_ref).iter()
                        .filter(|(k, _)| !k.is_transient())
                        .count();
                    bincode::Encode::encode(&count, encoder)?;
                    for (key, value) in (#value_ref).iter()
                        .filter(|(k, _)| !k.is_transient())
                    {
                        bincode::Encode::encode(key, encoder)?;
                        bincode::Encode::encode(value, encoder)?;
                    }
                }
            }
        }
        StorageType::AutoMap => {
            // For maps, filter out entries with transient keys or values
            quote! {
                {
                    let count = (#value_ref).iter()
                        .filter(|(k, v)| !k.is_transient() && !v.is_transient())
                        .count();
                    bincode::Encode::encode(&count, encoder)?;
                    for (key, value) in (#value_ref).iter()
                        .filter(|(k, v)| !k.is_transient() && !v.is_transient())
                    {
                        bincode::Encode::encode(key, encoder)?;
                        bincode::Encode::encode(value, encoder)?;
                    }
                }
            }
        }
        StorageType::IndexedVec => {
            // For IndexedVec, filter out transient entries
            quote! {
                {
                    let filtered: Vec<_> = (#value_ref).iter()
                        .filter(|v| !v.is_transient())
                        .cloned()
                        .collect();
                    bincode::Encode::encode(&filtered, encoder)?;
                }
            }
        }
    }
}

/// Check if encoding with transient filtering might produce an empty result.
///
/// For non-filtered fields, encoding always produces output.
/// For filtered fields, the result might be empty (skip discriminant).
fn field_needs_empty_check(field: &FieldInfo) -> bool {
    field.filter_transient || field.filter_transient_values
}

/// Generate an expression that checks if a value is non-empty after transient filtering.
///
/// Returns code that evaluates to `true` if there's data to encode.
fn generate_non_empty_check(
    field: &FieldInfo,
    value_expr: proc_macro2::TokenStream,
) -> proc_macro2::TokenStream {
    if field.filter_transient_values {
        return match field.storage_type {
            StorageType::AutoMap => {
                quote! {
                    (#value_expr).iter().any(|(_, v)| v.iter().any(|item| !item.is_transient()))
                }
            }
            _ => quote! { true },
        };
    }

    if !field.filter_transient {
        return quote! { true };
    }

    match field.storage_type {
        StorageType::Direct => {
            quote! {
                (#value_expr).as_ref().map_or(false, |v| !v.is_transient())
            }
        }
        StorageType::AutoSet => {
            quote! {
                (#value_expr).iter().any(|k| !k.is_transient())
            }
        }
        StorageType::CounterMap => {
            quote! {
                (#value_expr).iter().any(|(k, _)| !k.is_transient())
            }
        }
        StorageType::AutoMap => {
            quote! {
                (#value_expr).iter().any(|(k, v)| !k.is_transient() && !v.is_transient())
            }
        }
        StorageType::IndexedVec => {
            quote! {
                (#value_expr).iter().any(|v| !v.is_transient())
            }
        }
    }
}

/// Generate code to encode an inline field to bincode.
///
/// Delegates to `generate_encode_value` with `&self.field_name` as the value reference.
fn generate_encode_inline_field(field: &FieldInfo) -> proc_macro2::TokenStream {
    let field_name = &field.field_name;
    generate_encode_value(field, quote! { &self.#field_name })
}

/// Generate code to encode lazy fields to bincode.
/// Uses sentinel-terminated format: [discriminant, data]... [sentinel]
fn generate_encode_lazy_fields(fields: &[&FieldInfo]) -> proc_macro2::TokenStream {
    if fields.is_empty() {
        return quote! {};
    }

    // Generate match arms for encoding each field variant
    let encode_arms: Vec<_> = fields
        .iter()
        .enumerate()
        .map(|(idx, field)| {
            let discriminant = idx as u8 + 1;
            generate_encode_lazy_field_arm(field, discriminant)
        })
        .collect();

    quote! {
        // Encode each persistent lazy field in this category
        for field in &self.lazy {
            match field {
                #(#encode_arms)*
                _ => {} // Skip fields not in this category
            }
        }
        // Write sentinel to mark end of lazy fields
        bincode::Encode::encode(&#LAZY_FIELD_SENTINEL, encoder)?;
    }
}

/// Generate a match arm for encoding a lazy field.
///
/// Uses `generate_encode_value` for the encoding logic, wrapped with a conditional
/// discriminant write for fields that might filter to empty.
fn generate_encode_lazy_field_arm(field: &FieldInfo, discriminant: u8) -> proc_macro2::TokenStream {
    let variant_name = &field.variant_name;
    let encode_body = generate_encode_value(field, quote! { data });

    if field_needs_empty_check(field) {
        // For fields with transient filtering, check if non-empty before writing discriminant
        let non_empty_check = generate_non_empty_check(field, quote! { data });
        quote! {
            LazyField::#variant_name(data) => {
                if #non_empty_check {
                    bincode::Encode::encode(&#discriminant, encoder)?;
                    #encode_body
                }
            }
        }
    } else {
        // No filtering, always encode
        quote! {
            LazyField::#variant_name(data) => {
                bincode::Encode::encode(&#discriminant, encoder)?;
                #encode_body
            }
        }
    }
}

/// Generate code to decode lazy fields from bincode.
/// Reads until sentinel byte (0x00) is encountered.
fn generate_decode_lazy_fields(fields: &[&FieldInfo]) -> proc_macro2::TokenStream {
    if fields.is_empty() {
        return quote! {};
    }

    // Generate match arms for decoding each field variant
    let decode_arms: Vec<_> = fields
        .iter()
        .enumerate()
        .map(|(idx, field)| {
            let variant_name = &field.variant_name;
            let discriminant = idx as u8 + 1;
            quote! {
                #discriminant => LazyField::#variant_name(bincode::Decode::decode(decoder)?)
            }
        })
        .collect();

    quote! {
        // Decode lazy fields until LAZY_FIELD_SENTINEL
        loop {
            let discriminant: u8 = bincode::Decode::decode(decoder)?;
            let field = match discriminant {
                #(#decode_arms,)*
                #LAZY_FIELD_SENTINEL => {
                    break
                }
                _ => {
                    return Err(bincode::error::DecodeError::Other(
                        "Unknown lazy field discriminant",
                    ));
                }
            };
            self.lazy.push(field);
        }
    }
}

/// Generate snapshot clone and restore methods for TypedStorage.
///
/// Generates:
/// - `clone_meta_snapshot(&self) -> TypedStorage` - Clone only persistent meta fields
/// - `clone_data_snapshot(&self) -> TypedStorage` - Clone only persistent data fields
/// - `restore_from(&mut self, source, category)` - Restore data by category from decoded storage
/// - `restore_meta_from(&mut self, source)` - Restore meta fields from source
/// - `restore_data_from(&mut self, source)` - Restore data fields from source
/// - `restore_all_from(&mut self, source)` - Restore all fields from source
fn generate_snapshot_restore_methods(grouped_fields: &GroupedFields) -> proc_macro2::TokenStream {
    let has_flags = !grouped_fields.persisted_flag_fields.is_empty();

    // Collect persistent fields by category using helpers
    let persistent_inline_meta: Vec<_> = grouped_fields.persistent_inline_meta().collect();
    let persistent_inline_data: Vec<_> = grouped_fields.persistent_inline_data().collect();
    let persistent_lazy_meta: Vec<_> = grouped_fields.persistent_lazy_meta().collect();
    let persistent_lazy_data: Vec<_> = grouped_fields.persistent_lazy_data().collect();

    // Generate clone_meta_snapshot inline field assignments
    let clone_meta_inline: Vec<_> = persistent_inline_meta
        .iter()
        .map(|field| {
            let field_name = &field.field_name;
            quote! {
                snapshot.#field_name = self.#field_name.clone();
            }
        })
        .collect();

    // Generate clone_meta_snapshot lazy field match arms
    let clone_meta_lazy_arms: Vec<_> = persistent_lazy_meta
        .iter()
        .map(|field| {
            let variant_name = &field.variant_name;
            quote! {
                LazyField::#variant_name(data) => {
                    snapshot.lazy.push(LazyField::#variant_name(data.clone()));
                }
            }
        })
        .collect();

    // Generate clone_data_snapshot inline field assignments
    let clone_data_inline: Vec<_> = persistent_inline_data
        .iter()
        .map(|field| {
            let field_name = &field.field_name;
            quote! {
                snapshot.#field_name = self.#field_name.clone();
            }
        })
        .collect();

    // Generate clone_data_snapshot lazy field match arms
    let clone_data_lazy_arms: Vec<_> = persistent_lazy_data
        .iter()
        .map(|field| {
            let variant_name = &field.variant_name;
            quote! {
                LazyField::#variant_name(data) => {
                    snapshot.lazy.push(LazyField::#variant_name(data.clone()));
                }
            }
        })
        .collect();

    // Generate restore_meta_from inline field assignments
    let restore_meta_inline: Vec<_> = persistent_inline_meta
        .iter()
        .map(|field| {
            let field_name = &field.field_name;
            quote! {
                self.#field_name = source.#field_name;
            }
        })
        .collect();

    // Generate restore_data_from inline field assignments
    let restore_data_inline: Vec<_> = persistent_inline_data
        .iter()
        .map(|field| {
            let field_name = &field.field_name;
            quote! {
                self.#field_name = source.#field_name;
            }
        })
        .collect();

    // Generate restore_all_from inline field assignments (both meta and data)
    let restore_all_inline_meta: Vec<_> = persistent_inline_meta
        .iter()
        .map(|field| {
            let field_name = &field.field_name;
            quote! {
                self.#field_name = source.#field_name;
            }
        })
        .collect();
    let restore_all_inline_data: Vec<_> = persistent_inline_data
        .iter()
        .map(|field| {
            let field_name = &field.field_name;
            quote! {
                self.#field_name = source.#field_name;
            }
        })
        .collect();

    // Generate flags handling for clone/merge
    let clone_meta_flags = if has_flags {
        quote! {
            // Clone persisted flags
            snapshot.flags.set_persisted_bits(self.flags.persisted_bits());
        }
    } else {
        quote! {}
    };

    let restore_flags = if has_flags {
        quote! {
            // Restore persisted flags (preserve transient flags)
            let persisted_bits = source.flags.persisted_bits();
            self.flags.set_persisted_bits(persisted_bits);
        }
    } else {
        quote! {}
    };

    // Collect all persistent lazy fields (both meta and data) for clone_snapshot
    let clone_all_lazy_arms: Vec<_> = persistent_lazy_meta
        .iter()
        .chain(persistent_lazy_data.iter())
        .map(|field| {
            let variant_name = &field.variant_name;
            quote! {
                LazyField::#variant_name(data) => {
                    snapshot.lazy.push(LazyField::#variant_name(data.clone()));
                }
            }
        })
        .collect();

    quote! {
        impl TypedStorage {
            /// Create a snapshot containing all persistent fields (both meta and data).
            ///
            /// This clones all persistent fields into a new TypedStorage, skipping
            /// transient fields that may not be cloneable. Use this for the `Both`
            /// snapshot case where both meta and data are dirty.
            pub fn clone_snapshot(&self) -> TypedStorage {
                let mut snapshot = TypedStorage::new();

                // Clone inline meta fields
                #(#clone_meta_inline)*

                // Clone inline data fields
                #(#clone_data_inline)*

                #clone_meta_flags

                // Clone all persistent lazy fields (both meta and data)
                for field in &self.lazy {
                    match field {
                        #(#clone_all_lazy_arms)*
                        // Skip transient fields
                        _ => {}
                    }
                }

                snapshot
            }

            /// Create a snapshot containing only meta category fields for serialization.
            ///
            /// This clones only the persistent meta fields into a new TypedStorage,
            /// which can then be serialized outside the lock.
            pub fn clone_meta_snapshot(&self) -> TypedStorage {
                let mut snapshot = TypedStorage::new();

                // Clone inline meta fields
                #(#clone_meta_inline)*

                #clone_meta_flags

                // Clone lazy meta fields (only persistent ones)
                for field in &self.lazy {
                    match field {
                        #(#clone_meta_lazy_arms)*
                        // Skip transient and data fields
                        _ => {}
                    }
                }

                snapshot
            }

            /// Create a snapshot containing only data category fields for serialization.
            ///
            /// This clones only the persistent data fields into a new TypedStorage,
            /// which can then be serialized outside the lock.
            pub fn clone_data_snapshot(&self) -> TypedStorage {
                let mut snapshot = TypedStorage::new();

                // Clone inline data fields
                #(#clone_data_inline)*

                // Clone lazy data fields (only persistent ones)
                for field in &self.lazy {
                    match field {
                        #(#clone_data_lazy_arms)*
                        // Skip transient and meta fields
                        _ => {}
                    }
                }

                snapshot
            }

            /// Restore persisted data from a decoded TypedStorage.
            ///
            /// This is used during restore operations to copy decoded persisted data
            /// into the task's existing storage. It preserves transient state (flags,
            /// transient fields) while restoring the persisted data.
            ///
            /// # Invariant
            ///
            /// This method assumes the target does NOT already have the persistent fields
            /// being restored. This is guaranteed by the restore protocol which only calls
            /// this once per category when the task is first accessed. Debug assertions
            /// verify this invariant.
            ///
            /// The `category` parameter specifies which category of data to restore:
            /// - `Meta`: Restore meta fields (aggregation_number, output, upper, dirty, etc.)
            /// - `Data`: Restore data fields (output_dependent, dependencies, cell_data, etc.)
            /// - `All`: Restore both meta and data fields
            pub fn restore_from(
                &mut self,
                source: TypedStorage,
                category: crate::backend::TaskDataCategory,
            ) {
                match category {
                    crate::backend::TaskDataCategory::Meta => self.restore_meta_from(source),
                    crate::backend::TaskDataCategory::Data => self.restore_data_from(source),
                    crate::backend::TaskDataCategory::All => self.restore_all_from(source),
                }
            }

            /// Restore meta category fields from source.
            ///
            /// Debug assertions verify that the target doesn't already have the lazy fields
            /// being restored.
            fn restore_meta_from(&mut self, source: TypedStorage) {
                // Debug assertion: verify target doesn't already have persistent meta lazy fields
                debug_assert!(
                    !self.lazy.iter().any(|f| f.is_persistent() && f.is_meta()),
                    "restore_meta_from called on storage that already has persistent meta lazy fields"
                );

                // Inline meta fields - direct assignment
                #(#restore_meta_inline)*

                #restore_flags

                // Extend lazy vec with persistent meta fields from source
                self.lazy.extend(
                    source.lazy.into_iter().filter(|f| f.is_persistent() && f.is_meta())
                );
            }

            /// Restore data category fields from source.
            ///
            /// Debug assertions verify that the target doesn't already have the lazy fields
            /// being restored.
            fn restore_data_from(&mut self, source: TypedStorage) {
                // Debug assertion: verify target doesn't already have persistent data lazy fields
                debug_assert!(
                    !self.lazy.iter().any(|f| f.is_persistent() && f.is_data()),
                    "restore_data_from called on storage that already has persistent data lazy fields"
                );

                // Inline data fields - direct assignment
                #(#restore_data_inline)*

                // Extend lazy vec with persistent data fields from source
                self.lazy.extend(
                    source.lazy.into_iter().filter(|f| f.is_persistent() && f.is_data())
                );
            }

            /// Restore all fields from source (both meta and data).
            ///
            /// Debug assertions verify that the target doesn't already have the lazy fields
            /// being restored.
            fn restore_all_from(&mut self, source: TypedStorage) {
                // Debug assertion: verify target doesn't already have any persistent lazy fields
                debug_assert!(
                    !self.lazy.iter().any(|f| f.is_persistent()),
                    "restore_all_from called on storage that already has persistent lazy fields"
                );

                // Inline meta fields - direct assignment
                #(#restore_all_inline_meta)*

                // Inline data fields - direct assignment
                #(#restore_all_inline_data)*

                #restore_flags

                // Extend lazy vec with all persistent fields from source
                self.lazy.extend(
                    source.lazy.into_iter().filter(|f| f.is_persistent())
                );
            }
        }
    }
}

/// Generate shrink_to_fit method for TypedStorage.
///
/// This generates a method that calls shrink_to_fit() on all collection-type fields
/// (auto_set, counter_map, auto_map) to release excess memory.
fn generate_shrink_to_fit_method(grouped_fields: &GroupedFields) -> proc_macro2::TokenStream {
    // Helper to check if a storage type supports shrink_to_fit
    fn supports_shrink_to_fit(storage_type: &StorageType) -> bool {
        matches!(
            storage_type,
            StorageType::AutoSet | StorageType::CounterMap | StorageType::AutoMap
        )
    }

    // Collect inline fields that support shrink_to_fit
    let inline_shrink_calls: Vec<_> = grouped_fields
        .inline_meta_fields
        .iter()
        .chain(grouped_fields.inline_data_fields.iter())
        .filter(|f| supports_shrink_to_fit(&f.storage_type))
        .map(|field| {
            let field_name = &field.field_name;
            quote! {
                self.#field_name.shrink_to_fit();
            }
        })
        .collect();

    // Collect lazy fields that support shrink_to_fit
    let lazy_shrink_arms: Vec<_> = grouped_fields
        .lazy_meta_fields
        .iter()
        .chain(grouped_fields.lazy_data_fields.iter())
        .filter(|f| supports_shrink_to_fit(&f.storage_type))
        .map(|field| {
            let variant_name = &field.variant_name;
            quote! {
                LazyField::#variant_name(data) => {
                    data.shrink_to_fit();
                }
            }
        })
        .collect();

    // Only generate lazy field shrinking if there are lazy fields to shrink
    let lazy_shrink_block = if lazy_shrink_arms.is_empty() {
        quote! {}
    } else {
        quote! {
            // Shrink lazy collection fields
            for field in &mut self.lazy {
                match field {
                    #(#lazy_shrink_arms)*
                    // Skip fields that don't support shrink_to_fit
                    _ => {}
                }
            }
        }
    };

    quote! {
        impl TypedStorage {
            /// Shrink all collection fields to fit their current contents.
            ///
            /// This releases excess memory from hash maps and hash sets that may have
            /// grown larger than needed during task execution.
            pub fn shrink_to_fit(&mut self) {
                // Shrink inline collection fields
                #(#inline_shrink_calls)*

                #lazy_shrink_block

                // Shrink the lazy vec itself
                self.lazy.shrink_to_fit();
            }
        }
    }
}
