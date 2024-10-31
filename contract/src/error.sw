library;

pub enum Error {
    InvalidAmount: (),
    InvalidCard: (),
    GameEnded: (),
    InvalidPhase: (),
    RandomnessRanOut: (),
    RandomnessNotReady: (),
    InvalidSeed: (),
    RevealTooEarly: (),
}
