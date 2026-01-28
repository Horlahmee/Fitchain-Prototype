const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const Factory = await hre.ethers.getContractFactory("FitRewardsClaim");
  const c = await Factory.deploy(deployer.address);

  // ethers v6 way:
  await c.waitForDeployment();

  const addr = await c.getAddress();
  console.log("FitRewardsClaim deployed to:", addr);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
