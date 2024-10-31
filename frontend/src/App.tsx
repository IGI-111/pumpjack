import { cssObj } from "@fuel-ui/css";
import { Button, Box, BoxCentered, Heading } from "@fuel-ui/react";
import { useIsConnected, useWallet } from "@fuels/react";
import { useState, useEffect, useMemo } from "react";
import { useConnectUI, useDisconnect } from "@fuels/react";

import {
  CONTRACT_ID,
} from "./constants.ts";
import "./App.css";
import { Pumpjack } from "./sway-api/index.ts";
import { OutcomeOutput, OutcomeInput, GameStateOutput } from './sway-api/Pumpjack';

function App() {
  const { isConnected } = useIsConnected();
  const { wallet } = useWallet();

  const contract = useMemo(() => {
    if (wallet) {
      const contract = new Pumpjack(CONTRACT_ID, wallet);
      return contract;
    }
    return null;
  }, [wallet]);

  const mem_vrf_fee = useMemo(async () => {
    if(contract) {
      return ((await contract.functions.vrf_fee().get()).value as any).toNumber();
    }
    return null;
  }, [contract]);

   
  const { connect, isConnecting } = useConnectUI();
  const { disconnect } = useDisconnect();

  const [gameState, setGameState] = useState<GameStateOutput>();

  const updateGameState = async () => {
    if(contract) {
      const { value } = await contract.functions.game_state(
        { bits: wallet!.address.toB256() }
      ).get();
      console.log(value);
      setGameState(value);
    }
  };

  const waitForVrf = async (seed: string) => {
    console.log("waiting for vrf for seed", seed);
    // wait until vrf is ready
    while(true){
      const { value } = await contract!.functions.vrf_ready(seed).get();
      if(value){
        break;
      }
      console.log("vrf not ready");
      sleep(100);
    }
    console.log("vrf ready, revealing");
  }

  useEffect(() => {
    updateGameState();
  }, [contract]);
  

  return (
    <Box>
      { isConnected && wallet ? (
        <Box>
          <p>{wallet.address.toB256()}</p>
          { gameState !== undefined ? (
            <Box>
              <p>{renderCards(gameState.dealer_cards)}</p>
              <p>{renderCards(gameState.player_cards)}</p>
              <p>{gameState.outcome}</p>
              <p>Bet: {(gameState.bet as any).toNumber()}</p>
            </Box>
          ) : <Box/>}
          <Button onPress={() => { disconnect(); }}>
            Disconnect
          </Button>
          <Button onPress={async () => {
            const seed = randomSeed();
            const vrf_fee = await mem_vrf_fee;
            const bet = 10;
            const call = await contract!.functions.start(seed, vrf_fee, bet)
              .callParams({ forward: [vrf_fee + bet, wallet.provider.getBaseAssetId()] })
              .call();
            // const commit_res = await call.waitForResult()
            await waitForVrf(seed);
            await updateGameState();
          }}>Start</Button>
          <Button onPress={async () => {
            const seed = randomSeed();
            const vrf_fee = await mem_vrf_fee;
            const call = await contract!.functions.hit(seed, vrf_fee)
              .callParams({ forward: [vrf_fee, wallet.provider.getBaseAssetId()] })
              .call();
            // const commit_res = await call.waitForResult()
            await waitForVrf(seed);
            await updateGameState();
          }}>Hit</Button>
          <Button onPress={async () => {
            const seed = randomSeed();
            const vrf_fee = await mem_vrf_fee;
            const call = await contract!.functions.stand(seed, vrf_fee)
              .callParams({ forward: [vrf_fee, wallet.provider.getBaseAssetId()] })
              .call();
            // const commit_res = await call.waitForResult()
            await waitForVrf(seed);
            await updateGameState();
          }}>Stand</Button>
          <Button onPress={async () => {
            const outcome = convertOutcome(gameState!.outcome);
            console.log(outcome);
  
            const call = await contract!.functions.redeem(outcome)
              .call();
            console.log(call);
            const commit_res = await call.waitForResult();
            console.log(commit_res);
            await updateGameState();
          }}>Redeem</Button>
        </Box>
      ) : (
        <Box>
          <p>Connect with the Fuel Wallet</p>
          <Button onPress={() => { connect(); }}>
            {isConnecting ? "Connecting" : "Connect"}
          </Button>
        </Box>
      )}
    </Box>
  );
}

export default App;

const genRanHex = (size: number) => [...Array(size)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
const randomSeed = () => `0x${genRanHex(64)}`.toString();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const renderCards = (bytes: any): string => {
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
