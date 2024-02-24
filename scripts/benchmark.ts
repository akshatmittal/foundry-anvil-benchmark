import { Chain, createTestClient, getContract, http, publicActions, walletActions, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hardhat } from "viem/chains";

import { ForkedOracleArtifact } from "../artifacts/ForkedOracle";
import { encodedCalldata2, encodedCalldata1 } from "../artifacts/DeploymentTx";

const customChain = {
  ...hardhat,
  id: 1,
} as const satisfies Chain;

async function main() {
  console.log("Starting benchmark...");
  const client = createTestClient({
    mode: "anvil",
    transport: http("http://localhost:8545"),
    account: privateKeyToAccount("0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"),
    chain: customChain,
  })
    .extend(publicActions)
    .extend(walletActions);

  /*
   ** Task 0: Set account balance
   */
  console.log("Task 0...");
  await client.setBalance({
    address: await client.getAddresses().then((e) => e[0]),
    value: parseEther("1000"),
  });

  /*
   ** Task 1: Replace Oracle
   */
  console.log("Task 1...");
  const oracleInterface = getContract({
    client,
    abi: ForkedOracleArtifact.abi,
    address: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
  });

  const description = await oracleInterface.read.description();
  const decimals = await oracleInterface.read.decimals();
  const roundData = await oracleInterface.read.latestRoundData();

  await client.setCode({
    address: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
    bytecode: ForkedOracleArtifact.bytecode,
  });

  await oracleInterface.write.setData([decimals, roundData[1]]); // ~72k gas
  await oracleInterface.write.setDescription([description]); // ~30k gas

  /*
   ** Task 2: Mildly Complex Transaction
   ** - Deploy Token Contract (create2)
   ** - Mint Tokens
   ** - Add Liquidity
   ** - Transfer Liquidity
   */
  console.log("Task 2...");
  await client.sendTransaction({
    to: "0xca11bde05977b3631167028862be2a173976ca11",
    data: encodedCalldata1,
    value: parseEther("2"),
  }); // ~4.1m gas

  /*
   ** Task 3: Interact with the same contracts in Task 2
   */
  console.log("Task 3...");
  await client.sendTransaction({
    to: "0xca11bde05977b3631167028862be2a173976ca11",
    data: encodedCalldata2,
    value: parseEther("2"),
  }); // ~3.3m gas

  console.log("Tasks Complete.");
}

main().catch((error) => {
  console.error(error);

  process.exitCode = 1;
});
