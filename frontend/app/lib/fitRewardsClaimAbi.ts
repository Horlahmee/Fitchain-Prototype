export const FIT_REWARDS_CLAIM_ABI = [
  {
    type: "function",
    name: "claimWithSig",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amountWei", type: "uint256" },
      { name: "claimIdHash", type: "bytes32" },
      { name: "deadline", type: "uint256" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;
