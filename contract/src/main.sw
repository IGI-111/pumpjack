contract;

mod error;
mod rng;
mod score;

use std::storage::storage_map::*;
use std::storage::storage_bytes::*;
use std::storage::storage_vec::*;
use std::bytes::Bytes;
use std::hash::Hash;
use std::context::{msg_amount, this_balance};
use std::call_frames::msg_asset_id;
use std::auth::msg_sender;
use sway_libs::reentrancy::reentrancy_guard;

use error::Error;
use score::score;
use score::is_blackjack;
use rng::Rng;
use rng::request_vrf;

enum Outcome {
    Win: (),
    BlackJack: (),
    Lose: (),
    Bust: (),
    Push: (),
    Continue: (),
}
impl Eq for Outcome {
    fn eq(self, other: Self) -> bool {
        match (self, other) {
            (Self::Win, Self::Win) => true,
            (Self::BlackJack, Self::BlackJack) => true,
            (Self::Lose, Self::Lose) => true,
            (Self::Bust, Self::Bust) => true,
            (Self::Push, Self::Push) => true,
            (Self::Continue, Self::Continue) => true,
            _ => false,
        }
    }
}

enum Move {
    Start: b256,
    Hit: b256,
    Stand: b256,
}

storage {
    moves: StorageMap<Address, StorageVec<Move>> = StorageMap {},
    stood: StorageMap<Address, bool> = StorageMap {},
    // TODO: support non base assets bet
    bets: StorageMap<Address, u64> = StorageMap {},
}

fn player() -> Address {
    msg_sender().unwrap().as_address().unwrap() // caller address
}

fn max_bet() -> u64 {
    this_balance(AssetId::base()) / 100
}

struct GameState {
    dealer_cards: Bytes,
    player_cards: Bytes,
    outcome: Outcome,
    bet: u64,
}

abi Pumpjack {
    #[payable]
    #[storage(read, write)]
    fn start(seed: b256, vrf_fee: u64, bet: u64);

    #[payable]
    #[storage(read, write)]
    fn hit(seed: b256, vrf_fee: u64);

    #[payable]
    #[storage(read, write)]
    fn stand(seed: b256, vrf_fee: u64);

    #[storage(read, write)]
    fn redeem(claimed_outcome: Outcome);

    #[storage(read)]
    fn game_state(game: Address) -> GameState;

    fn vrf_fee() -> u64;
    fn vrf_ready(seed: b256) -> bool;
}

impl Pumpjack for Contract {
    #[payable]
    #[storage(read, write)]
    fn start(seed: b256, vrf_fee: u64, bet: u64) {
        reentrancy_guard();

        assert_eq(msg_amount(), vrf_fee + bet);
        assert_eq(msg_asset_id(), AssetId::base());

        let player = player();

        // reset moves
        let mut moves = Vec::new();
        moves.push(Move::Start(seed));
        storage.moves.get(player).store_vec(moves);
        // reset stand
        storage.stood.insert(player, false);
        // reset bet
        if bet >= max_bet() {
            // we can't bet more than there is to payout
            revert(7);
        }

        storage.bets.insert(player, bet);

        request_vrf(seed, vrf_fee, AssetId::base());
    }

    #[payable]
    #[storage(read, write)]
    fn hit(seed: b256, vrf_fee: u64) {
        reentrancy_guard();

        assert_eq(msg_amount(), vrf_fee);
        assert_eq(msg_asset_id(), AssetId::base());

        let player = player();

        assert(!storage.stood.get(player).try_read().unwrap_or(true));

        storage.moves.get(player).push(Move::Hit(seed));

        request_vrf(seed, vrf_fee, AssetId::base());
    }

    #[payable]
    #[storage(read, write)]
    fn stand(seed: b256, vrf_fee: u64) {
        reentrancy_guard();

        assert_eq(msg_amount(), vrf_fee);
        assert_eq(msg_asset_id(), AssetId::base());

        let player = player();

        assert(!storage.stood.get(player).try_read().unwrap_or(true));

        storage.moves.get(player).push(Move::Stand(seed));
        storage.stood.insert(player, true);

        request_vrf(seed, vrf_fee, AssetId::base());
    }

    #[storage(read, write)]
    fn redeem(claimed_outcome: Outcome) {
        reentrancy_guard();

        let player = player();

        let bet = storage.bets.get(player).read();
        // zero out bet
        storage.bets.get(player).write(0);

        let payout = match claimed_outcome {
            Outcome::Win => bet + bet,
            Outcome::BlackJack => bet + bet + bet / 2,
            Outcome::Push => bet,
            _ => revert(10),
        };

        std::asset::transfer(Identity::Address(player), AssetId::base(), payout);

        let game_state = simulate_game(player);
        assert_eq(claimed_outcome, game_state.outcome);
    }

    #[storage(read)]
    fn game_state(game: Address) -> GameState {
        simulate_game(game)
    }

    fn vrf_fee() -> u64 {
        let vrf_asset = AssetId::base();
        rng::vrf_fee(vrf_asset)
    }

    fn vrf_ready(seed: b256) -> bool {
        rng::vrf_ready(seed)
    }
}

#[storage(read)]
fn simulate_game(game: Address) -> GameState {
    let mut dealer_cards = Bytes::new();
    let mut player_cards = Bytes::new();

    let bet = storage.bets.get(game).try_read().unwrap_or(0);
    let moves = storage.moves.get(game).load_vec();

    let mut has_stood = false;

    let mut i = 0;
    while i < moves.len() {
        match moves.get(i).unwrap() {
            Move::Start(seed) => {
                let mut rng = Rng::new(seed);
                dealer_cards.push(rng.random_card());
                player_cards.push(rng.random_card());
                player_cards.push(rng.random_card());
            }
            Move::Hit(seed) => {
                let mut rng = Rng::new(seed);
                player_cards.push(rng.random_card());
            }
            Move::Stand(seed) => {
                has_stood = true;
                let mut rng = Rng::new(seed);
                while score(dealer_cards) < 17 && score(dealer_cards) < score(player_cards) {
                    dealer_cards.push(rng.random_card());
                }
            }
        }
        i += 1;
    }
    let outcome = if score(player_cards) > 21 {
        Outcome::Bust
    } else if !has_stood {
        Outcome::Continue
    } else if is_blackjack(player_cards)
        && !is_blackjack(dealer_cards)
    {
        Outcome::BlackJack
    } else if score(dealer_cards) == score(player_cards) {
        Outcome::Push
    } else if score(dealer_cards) > 21
        || score(player_cards) > score(dealer_cards)
    {
        Outcome::Win
    } else {
        Outcome::Lose
    };

    GameState {
        dealer_cards,
        player_cards,
        outcome,
        bet,
    }
}
