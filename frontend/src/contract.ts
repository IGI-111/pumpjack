import { Provider, WalletUnlocked, bn } from 'fuels';
import { Pumpjack } from './sway-types';
import { OutcomeOutput, OutcomeInput } from './sway-types/Pumpjack';
import { Vrf, TESTNET_CONTRACT_ID } from './vrf';

console.log("loaded");

const provider = await Provider.create('https://testnet.fuel.network/v1/graphql');
const wallet = WalletUnlocked.fromMnemonic(
  "silent dynamic pelican damage pistol recipe average index hobby crash physical brush design cruel diet worry cupboard various family test turkey print behave rival"
);
wallet.connect(provider);
const { balances } = await wallet.getBalances();
console.log('Balances', balances);

const deployed_id = "0xdcc795dce0d9dafa9fc2de6aa85c999796bc392969a3bb0152627cbae679f818";
const contract = new Pumpjack(deployed_id, wallet);

const vrf_fee = ((await contract.functions.vrf_fee().get()).value as any).toNumber();

const genRanHex = size => [...Array(size)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
const randomSeed = () => `0x${genRanHex(64)}`.toString();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const renderCards = (bytes): string => {
  let res = "";
  for(const b of bytes) {
    if(b === 0) {
      res += "A ";
    } else if(b >= 1 && b <= 9) {
      res += `${b+1} `;
    } else if(b === 10) {
      res += "J ";
    } else if(b === 11) {
      res += "Q ";
    } else if(b === 12) {
      res += "K ";
    } else {
      console.error("Unknown card", b);
    }
  }
  return res;
};
const convertOutcome = (o: OutcomeOutput): OutcomeInput => {
  switch(o) {
    case OutcomeOutput.Win:
      return OutcomeInput.Win;
    case OutcomeOutput.BlackJack:
      return OutcomeInput.BlackJack;
    case OutcomeOutput.Lose:
      return OutcomeInput.Lose;
    case OutcomeOutput.Bust:
      return OutcomeInput.Bust;
    case OutcomeOutput.Push:
      return OutcomeInput.Push;
    case OutcomeOutput.Continue:
      return OutcomeInput.Continue;
  }
}

const waitForVrf = async (seed) => {
  console.log("waiting for vrf for seed", seed);
  // wait until vrf is ready
  while(true){
    const { value } = await contract.functions.vrf_ready(seed).get();
    if(value){
      break;
    }
    console.log("vrf not ready");
    sleep(100);
  }
  console.log("vrf ready, revealing");
}

const updateGameState = async () => {
  const { value } = await contract.functions.game_state(
    { bits: wallet.address.toB256() }
  ).get();
  console.log(value);

  document.getElementById('dealer_cards').innerText = renderCards(value.dealer_cards);
  document.getElementById('player_cards').innerText = renderCards(value.player_cards);
  document.getElementById('outcome').innerText = value.outcome;
  document.getElementById('bet').innerText = `Bet: ${(value.bet as any).toNumber()}`;
}

document.getElementById('start').onclick = async () => {
  const seed = randomSeed();
  const call = await contract.functions.start(seed, vrf_fee, 10)
    .callParams({ forward: [vrf_fee + 10, provider.getBaseAssetId()] })
    .call();
  // const commit_res = await call.waitForResult()
  await waitForVrf(seed);
  await updateGameState();

  return false;
};
document.getElementById('hit').onclick = async () => {
  const seed = randomSeed();
  const call = await contract.functions.hit(seed, vrf_fee)
    .callParams({ forward: [vrf_fee, provider.getBaseAssetId()] })
    .call();
  // const commit_res = await call.waitForResult()
  await waitForVrf(seed);
  await updateGameState();

  return false;
};
document.getElementById('stand').onclick = async () => {
  const seed = randomSeed();
  const call = await contract.functions.stand(seed, vrf_fee)
    .callParams({ forward: [vrf_fee, provider.getBaseAssetId()] })
    .call();
  // const commit_res = await call.waitForResult()
  await waitForVrf(seed);
  await updateGameState();

  return false;
};
document.getElementById('redeem').onclick = async () => {

  const { value } = await contract.functions.game_state(
    { bits: wallet.address.toB256() }
  ).get();
  const outcome = convertOutcome(value.outcome);
  console.log(outcome);
  
  const call = await contract.functions.redeem(outcome)
    .call();
  console.log(call);
  const commit_res = await call.waitForResult();
  console.log(commit_res);
  await updateGameState();

  return false;
};
document.getElementById('game_state').onclick = async () => {
  await updateGameState();
  return false;
};
document.getElementById('fund').onclick = async () => {
  const transfer = await wallet.transferToContract(deployed_id, 1000, provider.getBaseAssetId());
  console.log(transfer);
  const res = await transfer.waitForResult();
  console.log(res);

  return false;
};

await updateGameState();

    // // FIXME: unknnown log, default to u64
    // {
    //   "logId": "16546776185816187435",
    //   "concreteTypeId": "1506e6f44c1d6291cdf46395a8e573276a4fa79e8ace3fc891e092ef32d1b0a0"
    // },
