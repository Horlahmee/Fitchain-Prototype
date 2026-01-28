import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const Factory = await ethers.getContractFactory("FitRewardsClaim");
  const c = await Factory.deploy(deployer.address);

  await c.waitForDeployment();
  console.log("FitRewardsClaim deployed to:", await c.getAddress());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
