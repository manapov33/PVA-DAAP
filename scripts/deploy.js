const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const usdtAddress =
    process.env.USDT_ADDRESS ||
    "0x4e31a8a10e960989d7478f55c19d1d39e19eb030"; // USDT Base
  const treasury =
    process.env.TREASURY || deployer.address;

  console.log("USDT:", usdtAddress);
  console.log("Treasury:", treasury);

  const PVAAuction = await ethers.getContractFactory("PVAAuction");
  const pva = await PVAAuction.deploy(usdtAddress, treasury);

  await pva.deployed();
  console.log("PVAAuction deployed to:", pva.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
