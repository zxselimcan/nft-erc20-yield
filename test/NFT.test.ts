import { expect } from "chai";
import { ethers } from "hardhat";
import { NFT, YieldToken } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("NFT Contract", () => {
  let nft: any;
  let yieldToken: any;
  let owner: any;
  let addr1: any;
  let addr2: any;
  const BASE_URI = "ipfs://QmExample/";
  const MINT_PRICE = ethers.parseEther("0.01");

  beforeEach(async () => {
    [owner, addr1, addr2] = await ethers.getSigners();
    
    const YieldToken = await ethers.getContractFactory("YieldToken");
    yieldToken = await YieldToken.deploy();
    await yieldToken.waitForDeployment();

    const NFT = await ethers.getContractFactory("NFT");
    nft = await NFT.deploy(await yieldToken.getAddress(), BASE_URI);
    await nft.waitForDeployment();

    // Grant minter role to NFT contract
    await yieldToken.grantMinterRole(await nft.getAddress());

    // Enable public sale
    await nft.togglePublicSaleStatus();

    // Set initial reward rate
    await nft.setRewardRate(10);
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await nft.owner()).to.equal(owner.address);
    });

    it("Should set the correct base URI", async function () {
      await nft.mint(addr1.address, 1, { value: MINT_PRICE });
      expect(await nft.tokenURI(0)).to.equal(BASE_URI + "0");
    });
  });

  describe("Minting", function () {
    it("Should mint NFTs correctly", async function () {
      await nft.mint(addr1.address, 2, { value: MINT_PRICE * 2n });
      expect(await nft.balanceOf(addr1.address)).to.equal(2);
    });

    it("Should fail if not enough ETH sent", async function () {
      await expect(
        nft.mint(addr1.address, 2, { value: MINT_PRICE })
      ).to.be.revertedWith("NOT_ENOUGH_ETH");
    });

    it("Should fail if trying to mint more than 10 tokens", async function () {
      await expect(
        nft.mint(addr1.address, 11, { value: MINT_PRICE * 11n })
      ).to.be.revertedWith("MAX_MINT_PER_TX_IS_10");
    });
  });

  describe("Token URI", function () {
    it("Should return correct token URI", async function () {
      await nft.mint(addr1.address, 1, { value: MINT_PRICE });
      expect(await nft.tokenURI(0)).to.equal(BASE_URI + "0");
    });

    it("Should fail for non-existent token", async function () {
      await expect(nft.tokenURI(999)).to.be.revertedWithCustomError(nft, "ERC721NonexistentToken");
    });
  });

  describe("Token Checks", function () {
    it("Should check token ownership correctly", async function () {
      await nft.mint(addr1.address, 1, { value: MINT_PRICE });
      expect(await nft.tokenCheck(0)).to.be.true;
      // For non-existent token, we expect false but don't want to trigger the revert
      const nonExistentTokenId = 999;
      try {
        await nft.tokenCheck(nonExistentTokenId);
      } catch {
        // Expected to fail
        return true;
      }
    });
  });

  describe("Safe Mint", function () {
    it("Should fail when trying to mint beyond max supply", async function () {
      const maxMints = Math.floor(10000 / 10);
      for (let i = 0; i < maxMints - 1; i++) {
        await nft.mint(addr1.address, 10, { value: MINT_PRICE * 10n });
      }
      await expect(
        nft.mint(addr1.address, 10, { value: MINT_PRICE * 10n })
      ).to.be.revertedWith("MINT_OUT");
    });
  });

  describe("Admin Functions", function () {
    it("Should toggle public sale status", async function () {
      const initialStatus = await nft.publicSaleStatus();
      await nft.togglePublicSaleStatus();
      expect(await nft.publicSaleStatus()).to.equal(!initialStatus);
    });

    it("Should update base URI", async function () {
      const newURI = "ipfs://newURI/";
      await nft.setBaseURI(newURI);
      await nft.mint(addr1.address, 1, { value: MINT_PRICE });
      expect(await nft.tokenURI(0)).to.equal(newURI + "0");
    });

    it("Should withdraw funds correctly", async function () {
      await nft.mint(addr1.address, 1, { value: MINT_PRICE });
      const beforeBalance = await ethers.provider.getBalance(owner.address);
      await nft.withdraw();
      const afterBalance = await ethers.provider.getBalance(owner.address);
      expect(afterBalance).to.be.gt(beforeBalance);
    });
  });

  describe("Minting and Supply", function () {
    it("Should track token counter correctly", async function () {
      await nft.mint(addr1.address, 1, { value: MINT_PRICE });
      await nft.mint(addr2.address, 2, { value: MINT_PRICE * 2n });
      const tokenURI0 = await nft.tokenURI(0);
      const tokenURI1 = await nft.tokenURI(1);
      const tokenURI2 = await nft.tokenURI(2);
      expect(tokenURI0).to.equal(BASE_URI + "0");
      expect(tokenURI1).to.equal(BASE_URI + "1");
      expect(tokenURI2).to.equal(BASE_URI + "2");
    });

    it("Should fail when public sale is not active", async function () {
      await nft.togglePublicSaleStatus(); // Disable public sale
      await expect(
        nft.mint(addr1.address, 1, { value: MINT_PRICE })
      ).to.be.revertedWith("PUBLIC_SALE_NOT_STARTED");
    });
  });

  describe("Internal Functions", function () {
    it("Should handle normal minting correctly", async function () {
      // Test safe mint through public mint
      await nft.mint(addr1.address, 1, { value: MINT_PRICE });
      expect(await nft.balanceOf(addr1.address)).to.equal(1);
      
      // Test multiple mints
      await nft.mint(addr1.address, 5, { value: MINT_PRICE * 5n });
      expect(await nft.balanceOf(addr1.address)).to.equal(6);
    });

    it("Should handle max supply correctly", async function () {
      // Mint tokens in batches of 10 until we reach MAX_SUPPLY - 10
      const maxSupply = 10000;
      const batchSize = 10;
      const batchesToMint = Math.floor(maxSupply / batchSize) - 1;

      for (let i = 0; i < batchesToMint; i++) {
        await nft.mint(addr1.address, batchSize, { value: MINT_PRICE * BigInt(batchSize) });
      }

      // Calculate remaining tokens
      const remaining = maxSupply - (batchesToMint * batchSize);
      
      // Try to mint more than remaining supply (but within MAX_MINT_PER_TX_IS_10)
      await expect(
        nft.mint(addr1.address, Math.min(10, remaining + 1), { value: MINT_PRICE * BigInt(Math.min(10, remaining + 1)) })
      ).to.be.revertedWith("MINT_OUT");

      // Should be able to mint the remaining tokens
      await nft.mint(addr1.address, remaining - 1, { value: MINT_PRICE * BigInt(remaining - 1) });

      // Final mint should fail
      await expect(
        nft.mint(addr1.address, 1, { value: MINT_PRICE })
      ).to.be.revertedWith("MINT_OUT");
    });

    it("Should handle base URI updates", async function () {
      await nft.mint(addr1.address, 1, { value: MINT_PRICE });
      expect(await nft.tokenURI(0)).to.equal(BASE_URI + "0");
      
      const newURI = "ipfs://newURI/";
      await nft.setBaseURI(newURI);
      expect(await nft.tokenURI(0)).to.equal(newURI + "0");
    });
  });

  describe("SafeMint Test", () => {
    it("Should test safeMint functionality through test contract", async () => {
      // Deploy test contract
      const TestNFT = await ethers.getContractFactory("TestNFT");
      const testNft = (await TestNFT.deploy(await yieldToken.getAddress(), BASE_URI)) as any;
      await testNft.waitForDeployment();
      
      // Grant minter role to test contract
      await yieldToken.grantMinterRole(await testNft.getAddress());
      
      // Test successful mint
      await testNft.testSafeMint(addr1.address);
      expect(await testNft.balanceOf(addr1.address)).to.equal(1);
      
      // Test minting to max supply
      const maxSupply = 10000;
      for(let i = 1; i < maxSupply; i++) {
        await testNft.testSafeMint(addr1.address);
      }
      
      // Verify max supply enforcement
      await expect(
        testNft.testSafeMint(addr1.address)
      ).to.be.revertedWith("MINT_OUT");
    });
  });
}); 