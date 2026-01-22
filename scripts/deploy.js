const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("Deploying with:", deployer.address);
  console.log("Balance:", (await deployer.provider.getBalance(deployer.address)).toString());

  const FitRewards = await hre.ethers.getContractFactory("FitRewards");

  // constructor takes initialOwner
  const contract = await FitRewards.deploy(deployer.address);

  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("FitRewards deployed to:", address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
