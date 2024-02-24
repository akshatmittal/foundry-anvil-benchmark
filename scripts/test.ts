import { Chain, ContractFunctionExecutionError, createTestClient, http, publicActions, walletActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hardhat } from "viem/chains";

const customChain = {
  ...hardhat,
  id: 1,
} as const satisfies Chain;

export async function runTests() {
  console.log("Starting tests...");
  const client = createTestClient({
    mode: "anvil",
    transport: http("http://localhost:8545"),
    account: privateKeyToAccount("0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"),
    chain: customChain,
  })
    .extend(publicActions)
    .extend(walletActions);

  const testResults = {
    case1: true,
  };

  /*
   ** Test 1: This random bug.
   ** Ref: https://github.com/foundry-rs/foundry/issues/7023
   */
  console.log("Test 1...");
  await client
    .readContract({
      abi: [
        {
          inputs: [],
          name: "PROPOSER_ROLE",
          outputs: [{ internalType: "bytes32", name: "hash", type: "bytes32" }],
          stateMutability: "view",
          type: "function",
        },
      ] as const,
      address: "0xFd6CC4F251eaE6d02f9F7B41D1e80464D3d2F377", // Notice: Not a TimeLock!!
      functionName: "PROPOSER_ROLE",
      blockNumber: 16681681n,
    })
    .catch((e) => {
      // console.log(e instanceof CallExecutionError); // bad
      // console.log(e instanceof ContractFunctionExecutionError); // good

      // This call is expected to revert, but NOT with an internal error.
      testResults.case1 = e instanceof ContractFunctionExecutionError;
    });

  console.log("Tests Complete:", testResults);

  return testResults;
}
