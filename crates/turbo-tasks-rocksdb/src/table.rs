// trait Table<K, V> {
//   type PrimaryKey;

//   fn get_key(data: &T) -> PrimaryKey;
// }

use std::{
    fmt::{Debug, Display},
    sync::Arc,
};

use lazy_static::lazy_static;
use rocksdb::AsColumnFamilyRef;

pub fn no_merge_wrapping<T>(func: impl FnOnce() -> T) -> T {
    func()
}

macro_rules! table_base_internal_merge {
    ($opt:ident, $value:tt + ()) => {};
    ($opt:ident, ($($value:ty),+) + (($($merge:ty),+): $merge_add_value:expr, $merge_add_merge:expr)) => {
        $crate::table::table_base_internal_merge!($opt, ($($value),+) + (($($merge),+): $merge_add_value, $merge_add_merge, $crate::table::no_merge_wrapping))
    };
    ($opt:ident, ($($value:ty),+) + (($($merge:ty),+): $merge_add_value:expr, $merge_add_merge:expr, $merge_wrapping:expr)) => {
        fn full_merge(_: &[u8], old: Option<&[u8]>, ops: &rocksdb::MergeOperands) -> Option<Vec<u8>> {
            let merge_wrapping = $merge_wrapping;
            merge_wrapping(|| {
                let merge_add_value = $merge_add_value;
                #[allow(unused_parens)]
                let mut current: ($($value),+) = if let Some(old) = old {
                    DefaultOptions::new().deserialize(old).ok()?
                } else {
                    Default::default()
                };
                for op in ops {
                    #[allow(unused_parens)]
                    let op: ($($merge),+) = DefaultOptions::new().deserialize(op).ok()?;
                    current = merge_add_value(current, op);
                }
                DefaultOptions::new().serialize(&current).ok()
            })
        }
        fn partial_merge(_: &[u8], _: Option<&[u8]>, ops: &rocksdb::MergeOperands) -> Option<Vec<u8>> {
            let merge_wrapping = $merge_wrapping;
            merge_wrapping(|| {
                let merge_add_merge = $merge_add_merge;
                let mut iter = ops.iter();
                #[allow(unused_parens)]
                let mut current: ($($merge),+) = DefaultOptions::new().deserialize(iter.next().unwrap()).ok()?;
                for op in iter {
                    #[allow(unused_parens)]
                    let op: ($($merge),+) = DefaultOptions::new().deserialize(op).ok()?;
                    current = merge_add_merge(current, op);
                }
                DefaultOptions::new().serialize(&current).ok()
            })
        }
        $opt.set_merge_operator(stringify!(($($merge),+)), full_merge, partial_merge);
    };
}
macro_rules! table_internal_merge {
    ($name:ident, ()) => {};
    ($name:ident, $key:tt + ()) => {};
    ($name:ident, (($($merge:ty),+): $($args:expr),+)) => {
        #[allow(dead_code)]
        pub fn merge(
            &self,
            batch: &mut crate::table::WriteBatch,
            #[allow(unused_parens)]
            merge: ($(&$merge),+),
        ) -> Result<(), bincode::Error> {
            #[cfg(feature = "log_db")]
            println!("DB     merge({} += {:?})", stringify!($name), merge);
            let merge = DefaultOptions::new().serialize(merge)?;
            let cf = self.db.cf_handle(stringify!($name)).unwrap();
            batch.merge(cf, &[], &merge);
            Ok(())
        }
    };
    ($name:ident, ($($key:ty),+) + (($($merge:ty),+): $($args:expr),+)) => {
        #[allow(dead_code)]
        pub fn merge(
            &self,
            batch: &mut crate::table::WriteBatch,
            #[allow(unused_parens)]
            key: ($(&$key),+),
            #[allow(unused_parens)]
            merge: ($(&$merge),+),
        ) -> Result<(), bincode::Error> {
            #[cfg(feature = "log_db")]
            println!("DB     merge({} {:?} += {:?})", stringify!($name), key, merge);
            #[allow(unused_parens)]
            let key = Self::make_key::<($(&$key),+)>(&key)?;
            let merge = DefaultOptions::new().serialize(merge)?;
            let cf = self.db.cf_handle(stringify!($name)).unwrap();
            batch.merge(cf, &key, &merge);
            Ok(())
        }

        #[allow(dead_code)]
        pub fn merge_no_batch(
            &self,
            #[allow(unused_parens)]
            key: ($(&$key),+),
            #[allow(unused_parens)]
            merge: ($(&$merge),+),
        ) -> Result<()> {
            #[cfg(feature = "log_db")]
            println!("DB     merge({} {:?} += {:?})", stringify!($name), key, merge);
            #[allow(unused_parens)]
            let key = Self::make_key::<($(&$key),+)>(&key)?;
            let merge = DefaultOptions::new().serialize(merge)?;
            let cf = self.db.cf_handle(stringify!($name)).unwrap();
            self.db.merge_cf_opt(cf, &key, &merge, &$crate::table::DEFAULT_WRITE_OPTIONS)?;
            Ok(())
        }
    };
}
macro_rules! table_base_internal_direction {
    ($name:ident, $opt:ident, $list:ident, single) => {};
    ($name:ident, $opt:ident, $list:ident, both) => {
        $list.push(ColumnFamilyDescriptor::new(
            concat!(stringify!($name), "_inverse"),
            $opt.clone(),
        ));
    };
}
macro_rules! table_base_internal_prefix {
    ($opt:ident, (ignore)) => {};
    ($opt:ident, ()) => {};
    ($opt:ident, (u8)) => {
        fn get_prefix(v: &[u8]) -> &[u8] {
            let len = v[0];
            &v[..len as usize]
        }
        $opt.set_prefix_extractor(rocksdb::SliceTransform::create(
            concat!("u8 length tagged"),
            get_prefix,
            None,
        ));
    };
    ($opt:ident, (full)) => {
        fn get_prefix(v: &[u8]) -> &[u8] {
            v
        }
        $opt.set_prefix_extractor(rocksdb::SliceTransform::create(
            concat!("full key"),
            get_prefix,
            None,
        ));
    };
    ($opt:ident, ($length:ident, $read:ident, $write:ident)) => {
        fn get_prefix(v: &[u8]) -> &[u8] {
            let len = <byteorder::BigEndian as byteorder::ByteOrder>::$read(v);
            &v[..len as usize]
        }
        $opt.set_prefix_extractor(rocksdb::SliceTransform::create(
            concat!(stringify!($length), " length tagged"),
            get_prefix,
            None,
        ));
    };
}
macro_rules! table_base_internal_prefix_helper {
    ((ignore)) => {};
    (()) => {
        #[allow(dead_code)]
        fn swap_key(key: &[u8], slice_len: usize) -> Vec<u8> {
            [&key[slice_len..], &key[..slice_len]].concat()
        }

        #[allow(dead_code)]
        fn make_key<T: serde::Serialize>(key: &T) -> Result<Vec<u8>, bincode::Error> {
            DefaultOptions::new().serialize(key)
        }

        #[allow(dead_code)]
        fn as_key(v: &[u8]) -> Vec<u8> {
            v.to_vec()
        }

        #[allow(dead_code)]
        fn from_key(v: &[u8]) -> &[u8] {
            v
        }

        fn next_key(key: &[u8]) -> Option<Vec<u8>> {
            let mut v = Vec::from(key);
            for i in (0..v.len()).rev() {
                if v[i] != u8::MAX {
                    v[i] += 1;
                    return Some(v);
                } else {
                    v[i] = 0;
                }
            }
            None
        }

        #[allow(dead_code)]
        fn set_upper_bound_partial(read_opt: &mut rocksdb::ReadOptions, partial_key: &[u8]) {
            if let Some(next_key) = Self::next_key(partial_key) {
                read_opt.set_iterate_upper_bound(next_key);
            }
        }

        #[allow(dead_code)]
        fn set_upper_bound_full(read_opt: &mut rocksdb::ReadOptions, key: &[u8]) {
            if let Some(next_key) = Self::next_key(key) {
                read_opt.set_iterate_upper_bound(next_key);
            }
        }
    };
    ((full)) => {
        #[allow(dead_code)]
        fn swap_key(key: &[u8], slice_len: usize) -> Vec<u8> {
            [&key[slice_len..], &key[..slice_len]].concat()
        }

        fn make_key<T: serde::Serialize>(key: &T) -> Result<Vec<u8>, bincode::Error> {
            DefaultOptions::new().serialize(key)
        }

        #[allow(dead_code)]
        fn as_key(v: &[u8]) -> Vec<u8> {
            v.to_vec()
        }

        #[allow(dead_code)]
        fn from_key(v: &[u8]) -> &[u8] {
            v
        }

        #[allow(dead_code)]
        fn next_key(key: &[u8]) -> Option<Vec<u8>> {
            let mut v = Vec::from(key);
            for i in (0..v.len()).rev() {
                if v[i] != u8::MAX {
                    v[i] += 1;
                    return Some(v);
                } else {
                    v[i] = 0;
                }
            }
            None
        }

        #[allow(dead_code)]
        fn set_upper_bound_partial(read_opt: &mut rocksdb::ReadOptions, partial_key: &[u8]) {
            if let Some(next_key) = Self::next_key(partial_key) {
                read_opt.set_iterate_upper_bound(next_key);
            }
        }

        #[allow(dead_code)]
        fn set_upper_bound_full(read_opt: &mut rocksdb::ReadOptions, _: &[u8]) {
            read_opt.set_prefix_same_as_start(true);
        }
    };
    ((u8)) => {
        #[allow(dead_code)]
        fn swap_key(key: &[u8], slice_len: usize) -> Vec<u8> {
            let len = match u8::try_from(key.len() - slice_len + 1) {
                Ok(l) => l,
                Err(_) => u8::MAX,
            };
            let mut len_buf = [0; 1];
            len_buf[0] = len;
            [&len_buf, &key[slice_len..], &key[1..slice_len]].concat()
        }

        fn make_key<T: serde::Serialize>(key: &T) -> Result<Vec<u8>, bincode::Error> {
            let mut buf = Vec::from([0; 1]);
            DefaultOptions::new().serialize_into(&mut buf, key)?;
            let len = match u8::try_from(buf.len()) {
                Ok(l) => l,
                Err(_) => u8::MAX,
            };
            buf[0] = len;
            Ok(buf)
        }

        #[allow(dead_code)]
        fn as_key(v: &[u8]) -> Vec<u8> {
            let len = match u8::try_from(v.len() + 1) {
                Ok(l) => l,
                Err(_) => u8::MAX,
            };
            let mut buf = Vec::with_capacity(v.len() as usize + 1);
            buf.push(len);
            buf.extend(v.iter());
            buf
        }

        #[allow(dead_code)]
        fn from_key(v: &[u8]) -> &[u8] {
            &v[1..]
        }

        #[allow(dead_code)]
        fn set_upper_bound_partial(read_opt: &mut rocksdb::ReadOptions, _: &[u8]) {
            read_opt.set_prefix_same_as_start(true);
        }

        #[allow(dead_code)]
        fn set_upper_bound_full(read_opt: &mut rocksdb::ReadOptions, _: &[u8]) {
            read_opt.set_prefix_same_as_start(true);
        }
    };
    (($length:ident, $read:ident, $write:ident)) => {
        #[allow(dead_code)]
        fn swap_key(key: &[u8], slice_len: usize) -> Vec<u8> {
            const LEN_SIZE: usize = std::mem::size_of::<$length>();
            let len = match $length::try_from(key.len() - slice_len + LEN_SIZE) {
                Ok(l) => l,
                Err(_) => $length::MAX,
            };
            let mut len_buf = [0; LEN_SIZE];
            <byteorder::BigEndian as byteorder::ByteOrder>::$write(&mut len_buf, len);
            [&len_buf, &key[slice_len..], &key[LEN_SIZE..slice_len]].concat()
        }

        fn make_key<T: serde::Serialize>(key: &T) -> Result<Vec<u8>, bincode::Error> {
            const LEN_SIZE: usize = std::mem::size_of::<$length>();
            let mut buf = Vec::from([0; LEN_SIZE]);
            DefaultOptions::new().serialize_into(&mut buf, key)?;
            let len = match $length::try_from(buf.len()) {
                Ok(l) => l,
                Err(_) => $length::MAX,
            };
            <byteorder::BigEndian as byteorder::ByteOrder>::$write(&mut buf, len);
            Ok(buf)
        }

        #[allow(dead_code)]
        fn as_key(v: &[u8]) -> Vec<u8> {
            const LEN_SIZE: usize = std::mem::size_of::<$length>();
            let len = match $length::try_from(v.len() + LEN_SIZE) {
                Ok(l) => l,
                Err(_) => $length::MAX,
            };
            let mut buf = Vec::from([0; LEN_SIZE]);
            <byteorder::BigEndian as byteorder::ByteOrder>::$write(&mut buf, len);
            buf.extend(v.iter());
            buf
        }

        #[allow(dead_code)]
        fn from_key(v: &[u8]) -> &[u8] {
            const LEN_SIZE: usize = std::mem::size_of::<$length>();
            &v[LEN_SIZE..]
        }

        #[allow(dead_code)]
        fn set_upper_bound_partial(read_opt: &mut rocksdb::ReadOptions, _: &[u8]) {
            read_opt.set_prefix_same_as_start(true);
        }

        #[allow(dead_code)]
        fn set_upper_bound_full(read_opt: &mut rocksdb::ReadOptions, _: &[u8]) {
            read_opt.set_prefix_same_as_start(true);
        }
    };
}
macro_rules! table_base_internal {
    ($name:ident) => {
        $crate::table::table_base_internal!($name, direction single value () merge () prefix ());
    };
    ($name:ident, direction $direction:tt) => {
        $crate::table::table_base_internal!($name, direction $direction value () merge () prefix ());
    };
    ($name:ident, direction $direction:tt prefix $prefix:tt) => {
        $crate::table::table_base_internal!($name, direction $direction value () merge () prefix $prefix);
    };
    ($name:ident, prefix $prefix:tt) => {
        $crate::table::table_base_internal!($name, direction single value () merge () prefix $prefix);
    };
    ($name:ident, value $value:tt merge $merge:tt) => {
        $crate::table::table_base_internal!($name, direction single value $value merge $merge prefix ());
    };
    ($name:ident, value $value:tt merge $merge:tt prefix $prefix:tt) => {
        $crate::table::table_base_internal!($name, direction single value $value merge $merge prefix $prefix);
    };
    ($name:ident, direction $direction:tt value $value:tt merge $merge:tt prefix $prefix:tt) => {
        #[allow(unused_imports)]
        use super::*;
        use anyhow::Result;
        use bincode::DefaultOptions;
        use bincode::Options;
        use rocksdb::{ColumnFamilyDescriptor, DB};
        use std::sync::Arc;

        pub struct Api {
            db: Arc<DB>,
        }

        impl Api {
            pub fn add_cf_descs(list: &mut Vec<ColumnFamilyDescriptor>) {
                #[allow(unused_mut)]
                let mut opt = $crate::table::DEFAULT_OPTIONS.clone();
                $crate::table::table_base_internal_merge!(opt, $value + $merge);
                $crate::table::table_base_internal_prefix!(opt, $prefix);
                $crate::table::table_base_internal_direction!($name, opt, list, $direction);
                list.push(ColumnFamilyDescriptor::new(stringify!($name), opt));
            }

            pub fn new(db: Arc<DB>) -> Self {
                Self { db }
            }

            $crate::table::table_base_internal_prefix_helper!($prefix);

            pub fn get_stats(&self) -> Result<$crate::table::CFStats> {
                let mut stats = $crate::table::CFStats::default();
                stats.name = stringify!($name).to_string();
                let cf = self.db.cf_handle(stringify!($name)).unwrap();
                let mut iter = self.db.raw_iterator_cf_opt(cf, $crate::table::get_default_read_options());
                iter.seek_to_first();
                while let (Some(key), Some(value)) = (iter.key(), iter.value()) {
                    stats.entries += 1;
                    stats.total_key_size += key.len();
                    stats.total_value_size += value.len();
                    if stats.max_key_size < key.len() {
                        stats.max_key_pair = (key.to_vec(), value.to_vec());
                        stats.max_key_size = key.len();
                    }
                    if stats.max_value_size < value.len() {
                        stats.max_value_pair = (key.to_vec(), value.to_vec());
                        stats.max_value_size = value.len();
                    }
                    iter.next();
                }
                iter.status()?;
                Ok(stats)
            }
        }
    };
}

macro_rules! table {
    ($name:ident, ($($value:ty),+)) => {
        $crate::table::table!($name, ($($value),+), merge());
    };
    ($name:ident, ($($value:ty),+), merge $merge:tt) => {
        pub mod $name {
            $crate::table::table_base_internal!($name, value(($($value),+)) merge $merge prefix(ignore));

            impl Api {
                #[allow(unused_parens)]
                pub fn get(&self) -> Result<Option<($($value),+)>> {
                    let cf = self.db.cf_handle(stringify!($name)).unwrap();
                    if let Some(value) = self.db.get_pinned_cf_opt(cf, &[], &$crate::table::DEFAULT_READ_OPTIONS)? {
                        let value = DefaultOptions::new().deserialize(&*value)?;
                        #[cfg(feature = "log_db")]
                        println!("DB get({}) = {:?}", stringify!($name), &value);
                        Ok(Some(value))
                    } else {
                        #[cfg(feature = "log_db")]
                        println!("DB get({}) = NOT FOUND", stringify!($name));
                        Ok(None)
                    }
                }

                #[allow(dead_code)]
                pub fn write(
                    &self,
                    batch: &mut crate::table::WriteBatch,
                    #[allow(unused_parens)]
                    value: ($(&$value),+),
                ) -> Result<(), bincode::Error> {
                    #[cfg(feature = "log_db")]
                    println!("DB     put({} = {:?})", stringify!($name), &value);
                    let value = DefaultOptions::new().serialize(value)?;
                    let cf = self.db.cf_handle(stringify!($name)).unwrap();
                    batch.put(cf, &[], value);
                    Ok(())
                }

                $crate::table::table_internal_merge!($name, $merge);
            }

            impl std::fmt::Debug for Api {
                fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                    let cf = self.db.cf_handle(stringify!($name)).unwrap();
                    if let Some(value) = self.db.get_pinned_cf_opt(cf, &[], &$crate::table::DEFAULT_READ_OPTIONS).unwrap() {
                        #[allow(unused_parens)]
                        let value: ($($value),+) = DefaultOptions::new().deserialize(&*value).unwrap();
                        std::fmt::Debug::fmt(&value, f)
                    } else {
                        std::fmt::Debug::fmt(&(None as Option<()>), f)
                    }
                }
            }

        }
    };
    ($name:ident, ($($key:ty),+) => [$($value:ty),+]) => {
        $crate::table::table!($name, ($($key),+) => [$($value),+], prefix());
    };
    ($name:ident, ($($key:ty),+) => [$($value:ty),+], prefix $prefix:tt) => {
        pub mod $name {
            $crate::table::table_base_internal!($name, prefix $prefix);

            impl Api {
                #[allow(unused_parens, dead_code)]
                pub fn get_all(
                    &self,
                    #[allow(unused_parens)]
                    key: ($(&$key),+),
                ) -> Result<Vec<($($value),+)>> {
                    let mut result = Vec::new();
                    let key_bytes = Self::make_key::<($(&$key),+)>(&key)?;
                    let key_len = key_bytes.len();
                    let mut read_opt = $crate::table::get_default_read_options();
                    Self::set_upper_bound_partial(&mut read_opt, &key_bytes);
                    let cf = self.db.cf_handle(stringify!($name)).unwrap();
                    let mut iter = self.db.raw_iterator_cf_opt(cf, read_opt);
                    iter.seek(key_bytes);
                    while let Some(value) = iter.key() {
                        let value = DefaultOptions::new().deserialize(&value[key_len..])?;
                        result.push(value);
                        iter.next();
                    }
                    iter.status()?;
                    #[cfg(feature = "log_db")]
                    println!("DB get_all({} {:?}) = {:#?}", stringify!($name), &key, &result);
                    Ok(result)
                }

                #[allow(unused_parens, dead_code)]
                pub fn get_range(&self, start: ($(&$key),+), end: ($(&$key),+)) -> Result<Vec<($($value),+)>> {
                    let mut result = Vec::new();
                    let start_bytes = Self::make_key::<($(&$key),+)>(&start)?;
                    let end_bytes = Self::make_key::<($(&$key),+)>(&end)?;
                    assert_eq!(start_bytes.len(), end_bytes.len());
                    let key_len = start_bytes.len();
                    let mut read_opt = $crate::table::get_default_read_options();
                    Self::set_upper_bound_partial(&mut read_opt, &start_bytes);
                    let cf = self.db.cf_handle(stringify!($name)).unwrap();
                    let mut iter = self.db.raw_iterator_cf_opt(cf, read_opt);
                    iter.seek(start_bytes);
                    while let Some(value) = iter.key() {
                        let value = DefaultOptions::new().deserialize(&value[key_len..])?;
                        result.push(value);
                        iter.next();
                    }
                    iter.status()?;
                    #[cfg(feature = "log_db")]
                    println!("DB get_range({} {:?} - {:?}) = {:#?}", stringify!($name), &start, &end, &result);
                    Ok(result)
                }

                #[allow(unused_parens, dead_code)]
                pub fn has(
                    &self,
                    #[allow(unused_parens)]
                    key: ($(&$key),+),
                    #[allow(unused_parens)]
                    value: ($(&$value),+)
                ) -> Result<bool> {
                    let mut key_bytes = Self::make_key::<($(&$key),+)>(&key)?;
                    DefaultOptions::new().serialize_into(&mut key_bytes, value)?;
                    let cf = self.db.cf_handle(stringify!($name)).unwrap();
                    let exists = self.db.get_pinned_cf_opt(cf, key_bytes, &$crate::table::DEFAULT_READ_OPTIONS)?.is_some();
                    #[cfg(feature = "log_db")]
                    println!("DB has({} {:?} {:?}) = {:?}", stringify!($name), &key, &value, exists);
                    Ok(exists)
                }

                #[allow(dead_code)]
                pub fn insert(
                    &self,
                    batch: &mut crate::table::WriteBatch,
                    #[allow(unused_parens)]
                    key: ($(&$key),+),
                    #[allow(unused_parens)]
                    value: ($(&$value),+),
                ) -> Result<(), bincode::Error> {
                    #[cfg(feature = "log_db")]
                    println!("DB     put({} {:?} += {:?})", stringify!($name), key, value);
                    #[allow(unused_parens)]
                    let mut key = Self::make_key::<($(&$key),+)>(&key)?;
                    DefaultOptions::new().serialize_into(&mut key, value)?;
                    let cf = self.db.cf_handle(stringify!($name)).unwrap();
                    batch.put(cf, &key, &[]);
                    Ok(())
                }

                #[allow(dead_code)]
                pub fn remove(
                    &self,
                    batch: &mut crate::table::WriteBatch,
                    #[allow(unused_parens)]
                    key: ($(&$key),+),
                    #[allow(unused_parens)]
                    value: ($(&$value),+),
                ) -> Result<(), bincode::Error> {
                    #[cfg(feature = "log_db")]
                    println!("DB     delete({} {:?} -= {:?})", stringify!($name), key, value);
                    #[allow(unused_parens)]
                    let mut key = Self::make_key::<($(&$key),+)>(&key)?;
                    DefaultOptions::new().serialize_into(&mut key, value)?;
                    let cf = self.db.cf_handle(stringify!($name)).unwrap();
                    batch.delete(cf, &key);
                    Ok(())
                }
            }

            impl std::fmt::Debug for Api {
                fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                    let mut list = f.debug_list();
                    let cf = self.db.cf_handle(stringify!($name)).unwrap();
                    for (key_bytes, _) in self.db.iterator_cf(cf, rocksdb::IteratorMode::Start) {
                        let mut c = std::io::Cursor::new(Self::from_key(&key_bytes));
                        #[allow(unused_parens)]
                        let key: Option<($($key),+)> = DefaultOptions::new().allow_trailing_bytes().deserialize_from(&mut c).ok();
                        #[allow(unused_parens)]
                        let value: Option<($($value),+)> = DefaultOptions::new().deserialize_from(&mut c).ok();
                        if let (Some(key), Some(value)) = (key, value) {
                            list.entry(&$crate::table::KeyValueDebug { key, value });
                        }
                    }
                    list.finish()
                }
            }
        }
    };
    ($name:ident, [$($key:ty),+] <=> [$($value:ty),+]) => {
        $crate::table::table!($name, [$($key),+] <=> [$($value),+], prefix());
    };
    ($name:ident, [$($key:ty),+] <=> [$($value:ty),+], prefix $prefix:tt) => {
        pub mod $name {
            $crate::table::table_base_internal!($name, direction both prefix $prefix);

            impl Api {
                #[allow(unused_parens, dead_code)]
                pub fn get_values(&self, key: ($(&$key),+)) -> Result<Vec<($($value),+)>> {
                    let mut result = Vec::new();
                    let key_bytes = Self::make_key::<($(&$key),+)>(&key)?;
                    let key_len = key_bytes.len();
                    let mut read_opt = $crate::table::get_default_read_options();
                    Self::set_upper_bound_partial(&mut read_opt, &key_bytes);
                    let cf = self.db.cf_handle(stringify!($name)).unwrap();
                    let mut iter = self.db.raw_iterator_cf_opt(cf, read_opt);
                    iter.seek(key_bytes);
                    while let Some(value) = iter.key() {
                        let value = DefaultOptions::new().deserialize(&value[key_len..])?;
                        result.push(value);
                        iter.next();
                    }
                    iter.status()?;
                    #[cfg(feature = "log_db")]
                    println!("DB get_values({} {:?}) = {:?}", stringify!($name), &key, &result);
                    Ok(result)
                }

                #[allow(unused_parens, dead_code)]
                pub fn get_keys(&self, value: ($(&$value),+)) -> Result<Vec<($($key),+)>> {
                    let mut result = Vec::new();
                    let value_bytes = Self::make_key::<($(&$value),+)>(&value)?;
                    let value_len = value_bytes.len();
                    let mut read_opt = $crate::table::get_default_read_options();
                    Self::set_upper_bound_partial(&mut read_opt, &value_bytes);
                    let cf2 = self
                        .db
                        .cf_handle(concat!(stringify!($name), "_inverse"))
                        .unwrap();
                    let mut iter = self.db.raw_iterator_cf_opt(cf2, read_opt);
                    iter.seek(&value_bytes);
                    while let Some(key) = iter.key() {
                        let key = DefaultOptions::new().deserialize(&key[value_len..])?;
                        result.push(key);
                        iter.next();
                    }
                    iter.status()?;
                    #[cfg(feature = "log_db")]
                    println!("DB get_keys({} {:?}) = {:?}", stringify!($name), &value, &result);
                    Ok(result)
                }

                #[allow(dead_code)]
                pub fn insert(
                    &self,
                    batch: &mut crate::table::WriteBatch,
                    #[allow(unused_parens)]
                    key: ($(&$key),+),
                    #[allow(unused_parens)]
                    value: ($(&$value),+),
                ) -> Result<(), bincode::Error> {
                    #[cfg(feature = "log_db")]
                    println!("DB     put({} {:?} +=+ {:?})", stringify!($name), key, value);
                    #[allow(unused_parens)]
                    let mut key = Self::make_key::<($(&$key),+)>(&key)?;
                    let key_len = key.len();
                    DefaultOptions::new().serialize_into(&mut key, value)?;
                    let cf = self.db.cf_handle(stringify!($name)).unwrap();
                    batch.put(cf, &key, &[]);
                    let cf2 = self
                        .db
                        .cf_handle(concat!(stringify!($name), "_inverse"))
                        .unwrap();
                    let key2 = Self::swap_key(&key, key_len);
                    batch.put(cf2, key2, &[]);
                    Ok(())
                }

                #[allow(dead_code)]
                pub fn remove(
                    &self,
                    batch: &mut crate::table::WriteBatch,
                    #[allow(unused_parens)]
                    key: ($(&$key),+),
                    #[allow(unused_parens)]
                    value: ($(&$value),+),
                ) -> Result<(), bincode::Error> {
                    #[cfg(feature = "log_db")]
                    println!("DB     delete({} {:?} -= {:?})", stringify!($name), key, value);
                    #[allow(unused_parens)]
                    let mut key = Self::make_key::<($(&$key),+)>(&key)?;
                    let key_len = key.len();
                    DefaultOptions::new().serialize_into(&mut key, value)?;
                    let cf = self.db.cf_handle(stringify!($name)).unwrap();
                    batch.delete(cf, &key);
                    let cf2 = self
                        .db
                        .cf_handle(concat!(stringify!($name), "_inverse"))
                        .unwrap();
                    let key2 = Self::swap_key(&key, key_len);
                    batch.delete(cf2, key2);
                    Ok(())
                }
            }

            impl std::fmt::Debug for Api {
                fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                    let mut list = f.debug_list();
                    let cf = self.db.cf_handle(stringify!($name)).unwrap();
                    for (key_bytes, _) in self.db.iterator_cf(cf, rocksdb::IteratorMode::Start) {
                        let mut c = std::io::Cursor::new(Self::from_key(&key_bytes));
                        #[allow(unused_parens)]
                        let key: Option<($($key),+)> = DefaultOptions::new().allow_trailing_bytes().deserialize_from(&mut c).ok();
                        #[allow(unused_parens)]
                        let value: Option<($($value),+)> = DefaultOptions::new().deserialize_from(&mut c).ok();
                        if let (Some(key), Some(value)) = (key, value) {
                            list.entry(&$crate::table::KeyValueDebug { key, value });
                        }
                    }
                    list.finish()
                }
            }
        }
    };
    ($name:ident, ($($key:ty),+) <=> [$($value:ty),+]) => {
        $crate::table::table!($name, ($($key),+) <=> [$($value),+], prefix());
    };
    ($name:ident, ($($key:ty),+) <=> [$($value:ty),+], prefix $prefix:tt) => {
        pub mod $name {
            $crate::table::table_base_internal!($name, direction both prefix $prefix);

            impl Api {
                #[allow(unused_parens, dead_code)]
                pub fn get_values(&self, key: ($(&$key),+)) -> Result<Vec<($($value),+)>> {
                    let mut result = Vec::new();
                    let key_bytes = Self::make_key::<($(&$key),+)>(&key)?;
                    let key_len = key_bytes.len();
                    let mut read_opt = $crate::table::get_default_read_options();
                    Self::set_upper_bound_partial(&mut read_opt, &key_bytes);
                    let cf = self.db.cf_handle(stringify!($name)).unwrap();
                    let mut iter = self.db.raw_iterator_cf_opt(cf, read_opt);
                    iter.seek(key_bytes);
                    while let Some(value) = iter.key() {
                        let value = DefaultOptions::new().deserialize(&value[key_len..])?;
                        result.push(value);
                        iter.next();
                    }
                    iter.status()?;
                    #[cfg(feature = "log_db")]
                    println!("DB get_values({} {:?}) = {:?}", stringify!($name), &key, &result);
                    Ok(result)
                }

                #[allow(unused_parens, dead_code)]
                pub fn get_key(&self, value: ($(&$value),+)) -> Result<Option<($($key),+)>> {
                    let value_bytes = Self::make_key::<($(&$value),+)>(&value)?;
                    let cf = self
                        .db
                        .cf_handle(concat!(stringify!($name), "_inverse"))
                        .unwrap();
                    if let Some(key) = self.db.get_pinned_cf_opt(cf, &value_bytes, &$crate::table::DEFAULT_READ_OPTIONS)? {
                        let key = DefaultOptions::new().deserialize(&*key)?;
                        #[cfg(feature = "log_db")]
                        println!("DB get_key({} {:?}) = {:?}", stringify!($name), &value, &key);
                        Ok(Some(key))
                    } else {
                        #[cfg(feature = "log_db")]
                        println!("DB get_key({}) = NOT FOUND", stringify!($name));
                        Ok(None)
                    }
                }

                #[allow(unused_parens, dead_code)]
                pub fn get_values_range(&self, start: ($(&$key),+), end: ($(&$key),+)) -> Result<Vec<($($value),+)>> {
                    let mut result = Vec::new();
                    let start_bytes = Self::make_key::<($(&$key),+)>(&start)?;
                    let end_bytes = Self::make_key::<($(&$key),+)>(&end)?;
                    assert_eq!(start_bytes.len(), end_bytes.len());
                    let key_len = start_bytes.len();
                    let mut read_opt = $crate::table::get_default_read_options();
                    Self::set_upper_bound_partial(&mut read_opt, &start_bytes);
                    let cf = self.db.cf_handle(stringify!($name)).unwrap();
                    let mut iter = self.db.raw_iterator_cf_opt(cf, read_opt);
                    iter.seek(start_bytes);
                    while let Some(value) = iter.key() {
                        let value = DefaultOptions::new().deserialize(&value[key_len..])?;
                        result.push(value);
                        iter.next();
                    }
                    iter.status()?;
                    #[cfg(feature = "log_db")]
                    println!("DB get_values_range({} {:?} - {:?}) = {:?}", stringify!($name), &start, &end, &result);
                    Ok(result)
                }

                #[allow(dead_code)]
                pub fn insert(
                    &self,
                    batch: &mut crate::table::WriteBatch,
                    #[allow(unused_parens)]
                    key: ($(&$key),+),
                    #[allow(unused_parens)]
                    value: ($(&$value),+),
                ) -> Result<(), bincode::Error> {
                    #[cfg(feature = "log_db")]
                    println!("DB     put({} {:?} +=+ {:?})", stringify!($name), key, value);
                    #[allow(unused_parens)]
                    let mut key = Self::make_key::<($(&$key),+)>(&key)?;
                    let key_len = key.len();
                    DefaultOptions::new().serialize_into(&mut key, value)?;
                    let cf = self.db.cf_handle(stringify!($name)).unwrap();
                    batch.put(cf, &key, &[]);
                    let cf2 = self
                        .db
                        .cf_handle(concat!(stringify!($name), "_inverse"))
                        .unwrap();
                    batch.put(cf2, Self::as_key(&key[key_len..]), Self::from_key(&key[..key_len]));
                    Ok(())
                }

                #[allow(dead_code)]
                pub fn remove(
                    &self,
                    batch: &mut crate::table::WriteBatch,
                    #[allow(unused_parens)]
                    key: ($(&$key),+),
                    #[allow(unused_parens)]
                    value: ($(&$value),+),
                ) -> Result<(), bincode::Error> {
                    #[cfg(feature = "log_db")]
                    println!("DB     delete({} {:?} -= {:?})", stringify!($name), key, value);
                    #[allow(unused_parens)]
                    #[allow(unused_parens)]
                    let mut key = Self::make_key::<($(&$key),+)>(&key)?;
                    let key_len = key.len();
                    DefaultOptions::new().serialize_into(&mut key, value)?;
                    let cf = self.db.cf_handle(stringify!($name)).unwrap();
                    batch.delete(cf, &key);
                    let cf2 = self
                        .db
                        .cf_handle(concat!(stringify!($name), "_inverse"))
                        .unwrap();
                    let key2 = Self::swap_key(&key, key_len);
                    batch.delete(cf2, key2);
                    Ok(())
                }

                #[allow(dead_code)]
                pub fn insert_unique(
                    &self,
                    batch: &mut crate::table::WriteBatch,
                    #[allow(unused_parens)]
                    key: ($(&$key),+),
                    #[allow(unused_parens)]
                    value: ($(&$value),+),
                ) -> Result<()> {
                    #[allow(unused_parens)]
                    let mut key_bytes = Self::make_key::<($(&$key),+)>(&key)?;
                    let key_len = key_bytes.len();
                    DefaultOptions::new().serialize_into(&mut key_bytes, value)?;
                    let keyed_value = Self::as_key(&key_bytes[key_len..]);
                    let only_key_bytes = Self::from_key(&key_bytes[..key_len]);
                    let cf = self.db.cf_handle(stringify!($name)).unwrap();
                    let cf2 = self
                        .db
                        .cf_handle(concat!(stringify!($name), "_inverse"))
                        .unwrap();
                    if let Some(current_key) = self.db.get_pinned_cf_opt(cf2, &keyed_value, &$crate::table::DEFAULT_READ_OPTIONS)? {
                        if &*current_key == only_key_bytes {
                            return Ok(());
                        }
                        #[cfg(feature = "log_db")]
                        println!("DB     put({} {:?} (moved) += {:?})", stringify!($name), key, value);
                        batch.delete(cf, [&*current_key, &key_bytes[key_len..]].concat());
                    } else {
                        #[cfg(feature = "log_db")]
                        println!("DB     put({} {:?} += {:?})", stringify!($name), key, value);
                    }
                    batch.put(cf, &key_bytes, &[]);
                    batch.put(cf2, &keyed_value, only_key_bytes);
                    Ok(())
                }
            }

            impl std::fmt::Debug for Api {
                fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                    let mut list = f.debug_list();
                    let cf2 = self.db.cf_handle(concat!(stringify!($name), "_inverse")).unwrap();
                    for (value_bytes, key_bytes) in self.db.iterator_cf(cf2, rocksdb::IteratorMode::Start) {
                        #[allow(unused_parens)]
                        let key: Option<($($key),+)> = DefaultOptions::new().deserialize(&key_bytes).ok();
                        #[allow(unused_parens)]
                        let value: Option<($($value),+)> = DefaultOptions::new().deserialize(Self::from_key(&value_bytes)).ok();
                        if let (Some(key), Some(value)) = (key, value) {
                            list.entry(&$crate::table::KeyValueDebug { key, value });
                        }
                    }
                    list.finish()
                }
            }
        }
    };
    ($name:ident, ($($key:ty),+) <=> ($($value:ty),+)) => {
        $crate::table::table!($name, ($($key),+) <=> ($($value),+), prefix());
    };
    ($name:ident, ($($key:ty),+) <=> ($($value:ty),+), prefix $prefix:tt) => {
        pub mod $name {
            $crate::table::table_base_internal!($name, direction both prefix $prefix);

            impl Api {
                #[allow(unused_parens, dead_code)]
                pub fn get_value(&self, key: ($(&$key),+)) -> Result<Option<($($value),+)>> {
                    let key = Self::make_key::<($(&$key),+)>(&key)?;
                    let cf = self.db.cf_handle(stringify!($name)).unwrap();
                    if let Some(value) = self.db.get_pinned_cf_opt(cf, &key, &$crate::table::DEFAULT_READ_OPTIONS)? {
                        let value = DefaultOptions::new().deserialize(&*value)?;
                        Ok(Some(value))
                    } else {
                        Ok(None)
                    }
                }

                #[allow(unused_parens, dead_code)]
                pub fn get_key(&self, value: ($(&$value),+)) -> Result<Option<($($key),+)>> {
                    let value_bytes = Self::make_key::<($(&$value),+)>(&value)?;
                    let cf = self
                        .db
                        .cf_handle(concat!(stringify!($name), "_inverse"))
                        .unwrap();
                    if let Some(key) = self.db.get_pinned_cf_opt(cf, &value_bytes, &$crate::table::DEFAULT_READ_OPTIONS)? {
                        let key = DefaultOptions::new().deserialize(&*key)?;
                        #[cfg(feature = "log_db")]
                        println!("DB get_key({} {:?}) = {:?}", stringify!($name), &value, &key);
                        Ok(Some(key))
                    } else {
                        #[cfg(feature = "log_db")]
                        println!("DB get_key({} {:?}) = NOT FOUND", stringify!($name), &value);
                        Ok(None)
                    }
                }

                #[allow(dead_code)]
                pub fn write(
                    &self,
                    batch: &mut crate::table::WriteBatch,
                    #[allow(unused_parens)]
                    key: ($(&$key),+),
                    #[allow(unused_parens)]
                    value: ($(&$value),+),
                ) -> Result<(), bincode::Error> {
                    #[cfg(feature = "log_db")]
                    println!("DB     put({} {:?} = {:?})", stringify!($name), &key, &value);
                    let key = DefaultOptions::new().serialize(&key)?;
                    let value = DefaultOptions::new().serialize(value)?;
                    let cf = self.db.cf_handle(stringify!($name)).unwrap();
                    batch.put(cf, Self::as_key(&key), &value);
                    let cf2 = self
                        .db
                        .cf_handle(concat!(stringify!($name), "_inverse"))
                        .unwrap();
                    batch.put(cf2, Self::as_key(&value), key);
                    Ok(())
                }

                #[allow(dead_code)]
                pub fn remove(
                    &self,
                    batch: &mut crate::table::WriteBatch,
                    #[allow(unused_parens)]
                    key: ($(&$key),+),
                    #[allow(unused_parens)]
                    value: ($(&$value),+),
                ) -> Result<(), bincode::Error> {
                    #[cfg(feature = "log_db")]
                    println!("DB     delete({} {:?} != {:?})", stringify!($name), &key, &value);
                    #[allow(unused_parens)]
                    let key = Self::make_key::<($(&$key),+)>(&key)?;
                    #[allow(unused_parens)]
                    let value = Self::make_key::<($(&$value),+)>(&value)?;
                    let cf = self.db.cf_handle(stringify!($name)).unwrap();
                    batch.delete(cf, key);
                    let cf2 = self
                        .db
                        .cf_handle(concat!(stringify!($name), "_inverse"))
                        .unwrap();
                    batch.delete(cf2, value);
                    Ok(())
                }
            }

            impl std::fmt::Debug for Api {
                fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                    let mut list = f.debug_list();
                    let cf = self.db.cf_handle(stringify!($name)).unwrap();
                    for (key_bytes, value_bytes) in self.db.iterator_cf(cf, rocksdb::IteratorMode::Start) {
                        #[allow(unused_parens)]
                        let key: Option<($($key),+)> = DefaultOptions::new().deserialize(Self::from_key(&key_bytes)).ok();
                        #[allow(unused_parens)]
                        let value: Option<($($value),+)> = DefaultOptions::new().deserialize(&value_bytes).ok();
                        if let (Some(key), Some(value)) = (key, value) {
                            list.entry(&$crate::table::KeyValueDebug { key, value });
                        }
                    }
                    list.finish()
                }
            }
        }
    };
    ($name:ident, ($($key:ty),+) => ($($value:ty),+)) => {
        $crate::table::table!($name, ($($key),+) => ($($value),+), merge(), prefix());
    };
    ($name:ident, ($($key:ty),+) => ($($value:ty),+), prefix $prefix:tt) => {
        $crate::table::table!($name, ($($key),+) => ($($value),+), merge(), prefix $prefix);
    };
    ($name:ident, ($($key:ty),+) => ($($value:ty),+), merge $merge:tt) => {
        $crate::table::table!($name, ($($key),+) => ($($value),+), merge $merge, prefix ());
    };
    ($name:ident, ($($key:ty),+) => ($($value:ty),+), merge $merge:tt, prefix $prefix:tt) => {
        pub mod $name {
            $crate::table::table_base_internal!($name, value(($($value),+)) merge $merge prefix $prefix);

            impl Api {
                #[allow(unused_parens, dead_code)]
                pub fn get(
                    &self,
                    #[allow(unused_parens)]
                    key: ($(&$key),+),
                ) -> Result<Option<($($value),+)>> {
                    let key_bytes = Self::make_key::<($(&$key),+)>(&key)?;
                    let cf = self.db.cf_handle(stringify!($name)).unwrap();
                    if let Some(value) = self.db.get_pinned_cf_opt(cf, key_bytes, &$crate::table::DEFAULT_READ_OPTIONS)? {
                        let value = DefaultOptions::new().deserialize(&*value)?;
                        #[cfg(feature = "log_db")]
                        println!("DB get({} {:?}) = {:?}", stringify!($name), &key, &value);
                        Ok(Some(value))
                    } else {
                        #[cfg(feature = "log_db")]
                        println!("DB get({} {:?}) = NOT FOUND", stringify!($name), &key);
                        Ok(None)
                    }
                }

                #[allow(dead_code)]
                pub fn write(
                    &self,
                    batch: &mut crate::table::WriteBatch,
                    #[allow(unused_parens)]
                    key: ($(&$key),+),
                    #[allow(unused_parens)]
                    value: ($(&$value),+),
                ) -> Result<(), bincode::Error> {
                    #[cfg(feature = "log_db")]
                    println!("DB     put({} {:?} = {:?})", stringify!($name), &key, &value);
                    #[allow(unused_parens)]
                    let key = Self::make_key::<($(&$key),+)>(&key)?;
                    let value = DefaultOptions::new().serialize(&value)?;
                    let cf = self.db.cf_handle(stringify!($name)).unwrap();
                    batch.put(cf, key, value);
                    Ok(())
                }

                #[allow(dead_code)]
                pub fn delete(
                    &self,
                    batch: &mut crate::table::WriteBatch,
                    #[allow(unused_parens)]
                    key: ($(&$key),+),
                ) -> Result<(), bincode::Error> {
                    #[cfg(feature = "log_db")]
                    println!("DB     delete({} {:?})", stringify!($name), &key);
                    #[allow(unused_parens)]
                    let key = Self::make_key::<($(&$key),+)>(&key)?;
                    let cf = self.db.cf_handle(stringify!($name)).unwrap();
                    batch.delete(cf, key);
                    Ok(())
                }

                #[allow(unused_parens, dead_code)]
                pub fn get_all(
                    &self,
                ) -> Result<Vec<(($($key),+), ($($value),+))>> {
                    let mut result = Vec::new();
                    let cf = self.db.cf_handle(stringify!($name)).unwrap();
                    let mut iter = self.db.raw_iterator_cf_opt(cf, $crate::table::get_default_read_options());
                    iter.seek_to_first();
                    while let(Some(key), Some(value)) = (iter.key(), iter.value()) {
                        let key = DefaultOptions::new().deserialize(&key)?;
                        let value = DefaultOptions::new().deserialize(&value)?;
                        result.push((key, value));
                        iter.next();
                    }
                    iter.status()?;
                    Ok(result)
                }

                $crate::table::table_internal_merge!($name, ($($key),+) + $merge);
            }

            impl std::fmt::Debug for Api {
                fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                    let mut list = f.debug_list();
                    let cf = self.db.cf_handle(stringify!($name)).unwrap();
                    for (key_bytes, value_bytes) in self.db.iterator_cf(cf, rocksdb::IteratorMode::Start) {
                        #[allow(unused_parens)]
                        let key: Option<($($key),+)> = DefaultOptions::new().deserialize(Self::from_key(&key_bytes)).ok();
                        #[allow(unused_parens)]
                        let value: Option<($($value),+)> = DefaultOptions::new().deserialize(&value_bytes).ok();
                        if let (Some(key), Some(value)) = (key, value) {
                            list.entry(&$crate::table::KeyValueDebug { key, value });
                        }
                    }
                    list.finish()
                }
            }
        }
    };
    ($name:ident, raw => ($($value:ty),+)) => {
        pub mod $name {
            $crate::table::table_base_internal!($name);

            impl Api {
                #[allow(unused_parens, dead_code)]
                pub fn get(
                    &self,
                    key_bytes: &[u8],
                ) -> Result<Option<($($value),+)>> {
                    let cf = self.db.cf_handle(stringify!($name)).unwrap();
                    if let Some(value) = self.db.get_pinned_cf_opt(cf, key_bytes, &$crate::table::DEFAULT_READ_OPTIONS)? {
                        let value = DefaultOptions::new().deserialize(&*value)?;
                        #[cfg(feature = "log_db")]
                        println!("DB get({} {:?}) = {:?}", stringify!($name), &key, &value);
                        Ok(Some(value))
                    } else {
                        #[cfg(feature = "log_db")]
                        println!("DB get({} {:?}) = NOT FOUND", stringify!($name), &key);
                        Ok(None)
                    }
                }

                #[allow(unused_parens, dead_code)]
                pub fn get_prefix(&self, prefix_bytes: &[u8], mut limit: usize) -> Result<(Vec<($($value),+)>, bool)> {
                    let mut result = Vec::new();
                    let mut read_opt = $crate::table::get_default_read_options();
                    Self::set_upper_bound_partial(&mut read_opt, prefix_bytes);
                    let cf = self.db.cf_handle(stringify!($name)).unwrap();
                    let mut iter = self.db.raw_iterator_cf_opt(cf, read_opt);
                    iter.seek(prefix_bytes);
                    let mut complete = true;
                    while let Some(value) = iter.value() {
                        if limit == 0 {
                            complete = false;
                            break;
                        }
                        limit -= 1;
                        let value = DefaultOptions::new().deserialize(value)?;
                        result.push(value);
                        iter.next();
                    }
                    iter.status()?;
                    #[cfg(feature = "log_db")]
                    println!("DB get_prefix({} {:?}) = {:#?}", stringify!($name), prefix_bytes, &result);
                    Ok((result, complete))
                }


                #[allow(dead_code)]
                pub fn write(
                    &self,
                    batch: &mut crate::table::WriteBatch,
                    key_bytes: &[u8],
                    #[allow(unused_parens)]
                    value: ($(&$value),+),
                ) -> Result<(), bincode::Error> {
                    #[cfg(feature = "log_db")]
                    println!("DB     put({} {:?} = {:?})", stringify!($name), &key, &value);
                    #[allow(unused_parens)]
                    let value = DefaultOptions::new().serialize(&value)?;
                    let cf = self.db.cf_handle(stringify!($name)).unwrap();
                    batch.put(cf, key_bytes, value);
                    Ok(())
                }

                #[allow(dead_code)]
                pub fn delete(
                    &self,
                    batch: &mut crate::table::WriteBatch,
                    key_bytes: &[u8],
                ) -> Result<(), bincode::Error> {
                    #[cfg(feature = "log_db")]
                    println!("DB     delete({} {:?})", stringify!($name), &key);
                    let cf = self.db.cf_handle(stringify!($name)).unwrap();
                    batch.delete(cf, key_bytes);
                    Ok(())
                }
            }

            impl std::fmt::Debug for Api {
                fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                    let mut list = f.debug_list();
                    let cf = self.db.cf_handle(stringify!($name)).unwrap();
                    for (key_bytes, value_bytes) in self.db.iterator_cf(cf, rocksdb::IteratorMode::Start) {
                        #[allow(unused_parens)]
                        let value: Option<($($value),+)> = DefaultOptions::new().deserialize(&value_bytes).ok();
                        if let Some(value) = value {
                            list.entry(&$crate::table::KeyValueDebug { key: key_bytes, value });
                        }
                    }
                    list.finish()
                }
            }
        }
    };
}

macro_rules! database {
    ($($table:tt),*) => {
        mod database {
            use anyhow::Result;
            use rocksdb::DB;
            use std::sync::Arc;

            pub struct Database {
                pub db: Arc<rocksdb::DB>,
                $(
                    pub $table: super::$table::Api
                ),*
            }

            impl Database {
                pub fn open<P: AsRef<std::path::Path>>(path: P) -> Result<Database> {
                    let mut cfs = Vec::new();
                    $(
                        super::$table::Api::add_cf_descs(&mut cfs);
                    )*
                    let db = Arc::new(DB::open_cf_descriptors(&$crate::table::DEFAULT_OPTIONS, path, cfs)?);
                    Ok(Database {
                        $(
                            $table: super::$table::Api::new(db.clone()),
                        )*
                        db,
                    })
                }

                pub fn batch(&self) -> $crate::table::WriteBatch {
                    $crate::table::WriteBatch::new(self.db.clone())
                }

                pub fn get_stats(&self) -> Result<Vec<$crate::table::CFStats>> {
                    let results = vec![$(
                        self.$table.get_stats()?,
                    )*];
                    Ok(results)
                }
            }

            impl std::fmt::Debug for Database {
                fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                    let mut d = f.debug_struct("Database");
                    $(
                        d.field(stringify!($table), &self.$table);
                    )*
                    d.finish()
                }
            }

            impl std::ops::Drop for Database {
                fn drop(&mut self) {
                    let mut opt = rocksdb::FlushOptions::new();
                    opt.set_wait(true);
                    let _ = self.db.flush_opt(&opt);
                    self.db.cancel_all_background_work(true);
                }
            }
        }

        pub use database::Database;
    };
}

pub fn get_default_read_options() -> rocksdb::ReadOptions {
    let mut opt = rocksdb::ReadOptions::default();
    opt.set_verify_checksums(false);
    opt
}

lazy_static! {
    pub static ref DEFAULT_READ_OPTIONS: rocksdb::ReadOptions = get_default_read_options();
    pub static ref DEFAULT_WRITE_OPTIONS: rocksdb::WriteOptions = {
        let mut opt = rocksdb::WriteOptions::default();
        opt.disable_wal(true);
        opt
    };
    pub static ref DEFAULT_OPTIONS: rocksdb::Options = {
        let mut opt = rocksdb::Options::default();
        opt.create_missing_column_families(true);
        opt.create_if_missing(true);
        opt.set_log_level(rocksdb::LogLevel::Debug);
        // set_atomic_flush is (only) needed when WAL is disabled
        opt.set_atomic_flush(true);
        // TODO Measure the following:
        opt.set_memtable_prefix_bloom_ratio(0.25);
        opt.set_allow_concurrent_memtable_write(true);
        opt.set_unordered_write(true);
        opt.increase_parallelism(num_cpus::get() as i32);
        opt.set_max_subcompactions(num_cpus::get() as u32);
        opt.optimize_universal_style_compaction(100 * 1024 * 1024);
        opt.set_max_write_buffer_size_to_maintain(-1);
        opt.set_skip_checking_sst_file_sizes_on_db_open(true);
        opt.set_skip_stats_update_on_db_open(true);
        opt.set_allow_mmap_writes(true);
        opt.set_allow_mmap_reads(true);
        opt
    };
}

pub struct WriteBatch {
    db: Arc<rocksdb::DB>,
    batch: Option<rocksdb::WriteBatch>,
}

impl WriteBatch {
    pub fn new(db: Arc<rocksdb::DB>) -> Self {
        #[cfg(feature = "log_db")]
        println!("DB   batch.new()");
        Self {
            db,
            batch: Some(rocksdb::WriteBatch::default()),
        }
    }

    pub fn put<K, V>(&mut self, cf: &impl AsColumnFamilyRef, key: K, value: V)
    where
        K: AsRef<[u8]>,
        V: AsRef<[u8]>,
    {
        let b = self
            .batch
            .as_mut()
            .expect("WriteBatch has already been written");
        b.put_cf(cf, key, value)
    }

    pub fn merge<K, V>(&mut self, cf: &impl AsColumnFamilyRef, key: K, value: V)
    where
        K: AsRef<[u8]>,
        V: AsRef<[u8]>,
    {
        let b = self
            .batch
            .as_mut()
            .expect("WriteBatch has already been written");
        b.merge_cf(cf, key, value)
    }

    pub fn delete<K>(&mut self, cf: &impl AsColumnFamilyRef, key: K)
    where
        K: AsRef<[u8]>,
    {
        let b = self
            .batch
            .as_mut()
            .expect("WriteBatch has already been written");
        b.delete_cf(cf, key)
    }

    pub fn write(&mut self) -> Result<(), rocksdb::Error> {
        #[cfg(feature = "log_db")]
        println!("DB   batch.write()");
        let batch = self
            .batch
            .take()
            .expect("WriteBatch has already been written");
        self.db.write_opt(batch, &DEFAULT_WRITE_OPTIONS)
    }

    #[allow(dead_code)]
    pub fn cancel(&mut self) {
        self.batch = None;
    }
}

impl Drop for WriteBatch {
    fn drop(&mut self) {
        if self.batch.is_some() {
            println!("WriteBatch shoudn't be dropped without calling 'write' or 'cancel' first");
        }
    }
}

pub(crate) use database;
pub(crate) use table;
pub(crate) use table_base_internal;
pub(crate) use table_base_internal_direction;
pub(crate) use table_base_internal_merge;
pub(crate) use table_base_internal_prefix;
pub(crate) use table_base_internal_prefix_helper;
pub(crate) use table_internal_merge;

pub(crate) struct KeyValueDebug<K, V> {
    pub key: K,
    pub value: V,
}

impl<K: Debug, V: Debug> Debug for KeyValueDebug<K, V> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        if f.alternate() {
            write!(f, "{:#?} => {:#?}", self.key, self.value)
        } else {
            write!(f, "{:?} => {:?}", self.key, self.value)
        }
    }
}

#[derive(Default)]
pub struct CFStats {
    pub name: String,
    pub entries: usize,
    pub total_key_size: usize,
    pub total_value_size: usize,
    pub max_key_size: usize,
    pub max_key_pair: (Vec<u8>, Vec<u8>),
    pub max_value_size: usize,
    pub max_value_pair: (Vec<u8>, Vec<u8>),
}

impl Display for CFStats {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        fn start(v: &Vec<u8>) -> &[u8] {
            &v[..std::cmp::min(10, v.len())]
        }
        write!(
            f,
            "
{}:
    entries: {}
    total_size: {} Kib -> {} Kib
    avg_size: {} b -> {} b
    max_key: {} b {:x?} -> {:x?}
    max_value: {} b {:x?} -> {:x?}",
            self.name,
            self.entries,
            self.total_key_size / 1024,
            self.total_value_size / 1024,
            if self.entries > 0 {
                self.total_key_size / self.entries
            } else {
                0
            },
            if self.entries > 0 {
                self.total_value_size / self.entries
            } else {
                0
            },
            self.max_key_size,
            start(&self.max_key_pair.0),
            start(&self.max_key_pair.1),
            self.max_value_size,
            start(&self.max_value_pair.0),
            start(&self.max_value_pair.1)
        )
    }
}
