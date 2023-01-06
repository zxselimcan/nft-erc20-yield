import { ethers } from "hardhat";

async function main() {

  const BASE_URI = "ipfs://"

  const YieldToken = await ethers.getContractFactory("YieldToken");
  const yieldToken = await YieldToken.deploy();
  const yieldTokenDeployed = await yieldToken.deployed();

  console.log("yield token address:", yieldTokenDeployed.address)


  const Nft = await ethers.getContractFactory("NFT");
  const nft = await Nft.deploy(yieldTokenDeployed.address, BASE_URI);

  const nftDeployed = await nft.deployed();
  console.log("nft address", nftDeployed.address)

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
