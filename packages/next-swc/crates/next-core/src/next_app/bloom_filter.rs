use std::{collections::HashSet, f64::consts::LN_2};

use serde::{Deserialize, Serialize};

use crate::{
    next_app::{AppPage, AppPath, PageSegment, PathSegment},
    next_config::Redirect,
};

pub struct ClientRouterFilter {
    pub static_filter: BloomFilter,
    pub dynamic_filter: BloomFilter,
}

pub fn create_client_router_filter(
    paths: &[AppPath],
    redirects: &[Redirect],
    allowed_error_rate: Option<f64>,
) -> ClientRouterFilter {
    let mut static_paths = HashSet::new();
    let mut dynamic_paths = HashSet::new();

    for path in paths {
        if path.is_dynamic() {
            let mut sub_path = AppPath::default();

            for segment in path.iter() {
                if !matches!(segment, PathSegment::Static(_)) {
                    break;
                }

                sub_path.0.push(segment.clone());
            }

            if !sub_path.is_empty() {
                dynamic_paths.insert(sub_path.to_string());
            }
        } else {
            static_paths.insert(path.to_string());
        }
    }

    for redirect in redirects {
        let app_page = AppPage::parse(&redirect.source).unwrap_or_default();

        if app_page
            .iter()
            .all(|token| matches!(token, PageSegment::Static(_)))
        {
            static_paths.insert(app_page.to_string());
        }
    }

    let static_filter = BloomFilter::from(static_paths.iter(), allowed_error_rate.unwrap_or(0.01));
    let dynamic_filter =
        BloomFilter::from(dynamic_paths.iter(), allowed_error_rate.unwrap_or(0.01));

    ClientRouterFilter {
        static_filter,
        dynamic_filter,
    }
}

// minimal implementation MurmurHash2 hash function
fn murmurhash2(s: &str) -> u32 {
    const M: u32 = 0x5bd1e995;

    let mut h: u32 = 0;
    for &b in s.as_bytes() {
        h = (h ^ b as u32).wrapping_mul(M);
        h ^= h >> 13;
        h = h.wrapping_mul(M);
    }

    h
}

#[cfg(test)]
mod test {
    use crate::next_app::{
        bloom_filter::{create_client_router_filter, murmurhash2, BloomFilter},
        AppPath, PathSegment,
    };

    // testing that we get the same output as the javascript implementation.
    #[test]
    fn test_murmurhash2() {
        assert_eq!(murmurhash2("/"), 4097004964);
        assert_eq!(murmurhash2("/test"), 3006934538);
        assert_eq!(murmurhash2("/test/route/123/long/as/heck"), 3187325762);
        assert_eq!(
            murmurhash2("/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
            2001750934
        );
    }

    // testing that we get the same output as the javascript implementation.
    #[test]
    fn test_create_client_router_filter() {
        let app_paths = &[
            AppPath(vec![]),
            AppPath(vec![PathSegment::Static("favicon.ico".to_string())]),
            AppPath(vec![PathSegment::Static("_not-found".to_string())]),
            AppPath(vec![PathSegment::Static("app".to_string())]),
        ];

        assert_eq!(
            create_client_router_filter(app_paths, &[], None).static_filter,
            BloomFilter {
                num_items: 4,
                error_rate: 0.01,
                num_bits: 39,
                num_hashes: 7,
                bit_array: vec![
                    0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0,
                    0, 0, 1, 1, 1, 0, 0, 1, 0, 1, 0, 1, 1
                ]
            }
        )
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BloomFilter {
    num_items: usize,
    error_rate: f64,
    num_bits: usize,
    num_hashes: usize,
    bit_array: Vec<u8>,
}

impl BloomFilter {
    pub fn new(num_items: usize, error_rate: f64) -> Self {
        let num_bits = (-(num_items as f64 * error_rate.ln()) / LN_2.powi(2)).ceil() as usize;
        let num_hashes = ((num_bits as f64 / num_items as f64) * LN_2).ceil() as usize;
        let bit_array = vec![0; num_bits];

        BloomFilter {
            num_items,
            error_rate,
            num_bits,
            num_hashes,
            bit_array,
        }
    }

    pub fn from<'a>(items: impl IntoIterator<Item = &'a String>, error_rate: f64) -> Self {
        let items = items.into_iter().collect::<Vec<_>>();

        let mut filter = Self::new(items.len(), error_rate);
        for item in items {
            filter.add(item)
        }
        filter
    }

    pub fn add(&mut self, item: &str) {
        let hash_values = self.get_hash_values(item);
        hash_values.iter().for_each(|&hash| {
            self.bit_array[hash] = 1;
        });
    }

    pub fn contains(&self, item: &str) -> bool {
        let hash_values = self.get_hash_values(item);
        hash_values.iter().all(|&hash| self.bit_array[hash] == 1)
    }

    fn get_hash_values(&self, item: &str) -> Vec<usize> {
        let mut hash_values = Vec::new();

        for i in 1..self.num_hashes + 1 {
            let hash = murmurhash2(&format!("{item}{i}")) as usize % self.num_bits;
            hash_values.push(hash);
        }

        hash_values
    }
}
