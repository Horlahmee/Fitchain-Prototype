const hre = require("hardhat");

const CONTRACT_ADDRESS = "0xe924F1b1c1a976Cd0D9D23066A83fC648cD38092";

async function main() {
  const [user] = await hre.ethers.getSigners();
  console.log("Using wallet:", user.address);

  const fit = await hre.ethers.getContractAt("FitRewards", CONTRACT_ADDRESS);

  // 1) Read before
  const before = await fit.getUser(user.address);
  const beforeBalance = await fit.balanceOf(user.address);

  console.log("\n--- BEFORE ---");
  console.log("lastActivityDay:", before[0].toString());
  console.log("streak:", before[1].toString());
  console.log("totalEarnedWhole:", before[2].toString());
  console.log("FIT balance (wei):", beforeBalance.toString());

  // 2) Call logActivity
  console.log("\nLogging activity...");
  const tx = await fit.logActivity();
  console.log("TX hash:", tx.hash);
  await tx.wait();
  console.log("✅ Activity logged.");

  // 3) Read after
  const after = await fit.getUser(user.address);
  const afterBalance = await fit.balanceOf(user.address);

  console.log("\n--- AFTER ---");
  console.log("lastActivityDay:", after[0].toString());
  console.log("streak:", after[1].toString());
  console.log("totalEarnedWhole:", after[2].toString());
  console.log("FIT balance (wei):", afterBalance.toString());

  // Optional: convert to human-readable
  const decimals = await fit.decimals();
  const human = hre.ethers.formatUnits(afterBalance, decimals);
  console.log("\nFIT balance (human):", human);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
