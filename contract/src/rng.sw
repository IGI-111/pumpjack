library;

use std::context::msg_amount;
use std::block::block_header_hash;
use std::block::height;
use std::hash::Hasher;
use std::hash::Hash;
use std::bytes::Bytes;
use std::b512::B512;
use vrf_abi::{randomness::{Fulfilled, Randomness, RandomnessState}, Vrf};
use ::error::Error;

// // testnet VRF
const VRF_ID = 0x749a7eefd3494f549a248cdcaaa174c1a19f0c1d7898fa7723b6b2f8ecc4828d;

// const SECURE_BLOCK_HEIGHT: u32 = 10;


pub struct Rng {
    offset: u64,
    random_bytes: Bytes,
}

impl Rng {
    pub fn new(seed: b256) -> Self {
        let vrf = abi(Vrf, VRF_ID);

        // if std::block::height() < commit_height + SECURE_BLOCK_HEIGHT {
        //     log(Error::RevealTooEarly);
        //     revert(3);
        // }

        // let mut ha = Hasher::new();

        // seed.hash(ha);
        // let mut i: u32 = 1;
        // while i < SECURE_BLOCK_HEIGHT - 1u32 {
        //     block_header_hash(height() - i).unwrap().hash(ha);
        //     i += 1;
        // }
        // let random_bytes = Bytes::from(ha.keccak256());

        let randomness: B512 = match vrf.get_request_by_seed(seed) {
            Some(r) => match r.state {
                RandomnessState::Fulfilled(x) => {
                    x.randomness
                },
                RandomnessState::Unfulfilled(_) => {
                    log(Error::RandomnessNotReady);
                    revert(1)
                }
            },
            None => {
                log(Error::InvalidSeed);
                revert(1)
            },
        };
        let random_bytes = Bytes::from(randomness.bits()[0]);

        Self {
            random_bytes,
            offset: 0,
        }
    }

    pub fn random_card(ref mut self) -> u8 {
        if self.offset >= self.random_bytes.len() {
            log(Error::RandomnessRanOut);
            revert(1);
        }

        let res = self.random_bytes.get(self.offset).unwrap() % 13;
        self.offset += 1;
        res
    }
}

pub fn request_vrf(seed: b256, fee: u64, fee_asset: AssetId) {
    let vrf = abi(Vrf, VRF_ID);

    let min_fee = vrf.get_fee(fee_asset);
    if min_fee > fee {
        log(Error::InvalidAmount);
        revert(2);
    }

    let _ = vrf.request {
        gas: 1_000_000,
        asset_id: fee_asset.bits(),
        coins: fee,
    }(seed);
}

pub fn vrf_ready(seed: b256) -> bool {
    let vrf = abi(Vrf, VRF_ID);
    match vrf.get_request_by_seed(seed) {
        Some(r) => match r.state {
            RandomnessState::Fulfilled(_) => true,
            RandomnessState::Unfulfilled(_) => false,
        },
        None => false,
    }
}

pub fn vrf_fee(fee_asset: AssetId) -> u64 {
    let vrf = abi(Vrf, VRF_ID);
    vrf.get_fee(fee_asset)
}
