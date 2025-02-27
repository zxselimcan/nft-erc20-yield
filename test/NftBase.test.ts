import { expect } from "chai";
import { ethers } from "hardhat";
import { NFT, YieldToken } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("NftBase Contract", () => {
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

  describe("Staking Status", function () {
    it("Should handle staking status correctly", async function () {
      await nft.pauseStaking();
      expect(await nft.stakingStatus()).to.equal(1); // PAUSE
      await nft.continueStaking();
      expect(await nft.stakingStatus()).to.equal(0); // CONTINUE
    });

    it("Should handle empty periods array", async function () {
      const newNFT = await (await ethers.getContractFactory("NFT")).deploy(
        await yieldToken.getAddress(),
        BASE_URI
      );
      expect(await newNFT.collectableYieldTokenForOne(0)).to.equal(0);
    });
  });

  describe("Staking and Rewards", function () {
    beforeEach(async function () {
      // Mint some NFTs for testing
      await nft.mint(addr1.address, 2, { value: MINT_PRICE * 2n });
    });

    it("Should start accruing rewards after mint", async function () {
      const stakeTime = await nft.tokenIdToStakeTime(0);
      expect(stakeTime).to.be.gt(0);
    });

    it("Should calculate rewards correctly", async function () {
      // Advance time by 1 day
      await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);

      const rewards = await nft.collectableYieldTokenForOne(0);
      expect(rewards).to.be.gt(0);
    });

    it("Should collect rewards correctly", async function () {
      await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);

      const beforeBalance = await yieldToken.balanceOf(addr1.address);
      await nft.connect(addr1).collectYieldTokenForOne(0);
      const afterBalance = await yieldToken.balanceOf(addr1.address);

      expect(afterBalance).to.be.gt(beforeBalance);
    });

    it("Should collect rewards for all tokens", async function () {
      await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);

      const beforeBalance = await yieldToken.balanceOf(addr1.address);
      await nft.connect(addr1).collectYieldTokenForAll(addr1.address);
      const afterBalance = await yieldToken.balanceOf(addr1.address);

      expect(afterBalance).to.be.gt(beforeBalance);
    });

    it("Should update stake time after transfer", async function () {
      const oldStakeTime = await nft.tokenIdToStakeTime(0);
      await nft.connect(addr1).transferFrom(addr1.address, addr2.address, 0);
      const newStakeTime = await nft.tokenIdToStakeTime(0);

      expect(newStakeTime).to.be.gt(oldStakeTime);
    });
  });

  describe("Admin Functions", function () {
    it("Should update reward rate", async function () {
      const newRate = 2;
      await nft.setRewardRate(newRate);
      expect(await nft.rewardRate()).to.equal(newRate);
    });
  });

  describe("Edge Cases", function () {
    it("Should handle wallet with no tokens", async function () {
      expect((await nft.walletOfOwner(addr1.address)).length).to.equal(0);
    });

    it("Should handle period with endTime before stakeTime", async function () {
      await nft.mint(addr1.address, 1, { value: MINT_PRICE });
      await nft.pauseStaking();
      await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);
      await nft.setRewardRate(20);
      const rewards = await nft.collectableYieldTokenForOne(0);
      expect(rewards).to.be.gt(0);
    });

    it("Should handle multiple reward rate changes", async function () {
      await nft.mint(addr1.address, 1, { value: MINT_PRICE });
      await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
      await nft.setRewardRate(20);
      await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
      await nft.setRewardRate(30);
      const rewards = await nft.collectableYieldTokenForOne(0);
      expect(rewards).to.be.gt(0);
    });

    it("Should handle token transfers and rewards", async function () {
      await nft.mint(addr1.address, 1, { value: MINT_PRICE });
      await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
      await nft.connect(addr1).collectYieldTokenForOne(0);
      await nft.connect(addr1).transferFrom(addr1.address, addr2.address, 0);
      await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
      await nft.connect(addr2).collectYieldTokenForOne(0);
    });

    it("Should handle interface support checks", async function () {
      // Test ERC721 interface
      expect(await nft.supportsInterface("0x80ac58cd")).to.be.true;
      // Test ERC721Enumerable interface
      expect(await nft.supportsInterface("0x780e9d63")).to.be.true;
      // Test invalid interface
      expect(await nft.supportsInterface("0x12345678")).to.be.false;
    });
  });

  describe("Staking System Edge Cases", function () {
    it("Should handle staking with zero periods", async function () {
      const newNFT = await (await ethers.getContractFactory("NFT")).deploy(
        await yieldToken.getAddress(),
        BASE_URI
      );
      await yieldToken.grantMinterRole(await newNFT.getAddress());
      await newNFT.togglePublicSaleStatus();
      await newNFT.mint(addr1.address, 1, { value: MINT_PRICE });
      expect(await newNFT.collectableYieldTokenForOne(0)).to.equal(0);
    });

    it("Should handle staking with multiple period transitions", async function () {
      await nft.mint(addr1.address, 1, { value: MINT_PRICE });
      
      // First period
      await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
      await nft.setRewardRate(20);
      
      // Second period with pause
      await ethers.provider.send("evm_increaseTime", [12 * 60 * 60]);
      await nft.pauseStaking();
      await ethers.provider.send("evm_increaseTime", [12 * 60 * 60]);
      
      // Third period
      await nft.setRewardRate(30);
      await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
      
      const rewards = await nft.collectableYieldTokenForOne(0);
      expect(rewards).to.be.gt(0);
    });

    it("Should handle staking with multiple transfers and claims", async function () {
      await nft.mint(addr1.address, 1, { value: MINT_PRICE });
      await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
      await nft.connect(addr1).collectYieldTokenForOne(0);
      
      await nft.connect(addr1).transferFrom(addr1.address, addr2.address, 0);
      await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
      await nft.connect(addr2).collectYieldTokenForOne(0);
      
      await nft.connect(addr2).transferFrom(addr2.address, addr1.address, 0);
      await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
      await nft.connect(addr1).collectYieldTokenForOne(0);
    });
  });

  describe("Staking Edge Cases", function () {
    it("Should handle multiple periods with different reward rates", async function () {
      await nft.mint(addr1.address, 1, { value: MINT_PRICE });
      
      // First period
      await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
      await nft.setRewardRate(20);
      
      // Second period
      await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
      await nft.pauseStaking();
      await nft.setRewardRate(30);
      
      // Third period
      await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
      await nft.connect(addr1).collectYieldTokenForOne(0);
    });

    it("Should handle token transfers between periods", async function () {
      await nft.mint(addr1.address, 1, { value: MINT_PRICE });
      await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
      const beforeBalance = await yieldToken.balanceOf(addr1.address);
      await nft.connect(addr1).collectYieldTokenForOne(0);
      const afterBalance = await yieldToken.balanceOf(addr1.address);
      expect(afterBalance).to.be.gt(beforeBalance);
      
      await nft.connect(addr1).transferFrom(addr1.address, addr2.address, 0);
      await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
      const beforeBalance2 = await yieldToken.balanceOf(addr2.address);
      await nft.connect(addr2).collectYieldTokenForOne(0);
      const afterBalance2 = await yieldToken.balanceOf(addr2.address);
      expect(afterBalance2).to.be.gt(beforeBalance2);
    });

    it("Should handle internal functions through public interfaces", async function () {
      // Test _increaseBalance through minting
      await nft.mint(addr1.address, 1, { value: MINT_PRICE });
      expect(await nft.balanceOf(addr1.address)).to.equal(1);

      // Test _update through transfer
      await nft.connect(addr1).transferFrom(addr1.address, addr2.address, 0);
      expect(await nft.balanceOf(addr2.address)).to.equal(1);
      expect(await nft.balanceOf(addr1.address)).to.equal(0);
    });

    it("Should handle invalid reward rates", async function () {
      await expect(nft.setRewardRate(0)).to.be.revertedWith("Invalid reward rate");
      await expect(nft.setRewardRate(1001)).to.be.revertedWith("Invalid reward rate");
    });

    it("Should handle consecutive transfers", async function () {
      await nft.mint(addr1.address, 1, { value: MINT_PRICE });
      await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
      await nft.connect(addr1).collectYieldTokenForOne(0);
      await nft.connect(addr1).transferFrom(addr1.address, addr2.address, 0);
      await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
      await nft.connect(addr2).transferFrom(addr2.address, addr1.address, 0);
      await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
      await nft.connect(addr1).collectYieldTokenForOne(0);
    });
  });

  describe("Advanced Staking Scenarios", function () {
    it("Should handle staking with zero stake time", async function () {
      const newNFT = await (await ethers.getContractFactory("NFT")).deploy(
        await yieldToken.getAddress(),
        BASE_URI
      );
      await yieldToken.grantMinterRole(await newNFT.getAddress());
      await newNFT.togglePublicSaleStatus();
      await newNFT.mint(addr1.address, 1, { value: MINT_PRICE });
      expect(await newNFT.tokenIdToStakeTime(0)).to.be.gt(0);
    });

    it("Should handle staking with multiple period changes", async function () {
      await nft.mint(addr1.address, 1, { value: MINT_PRICE });
      
      // First period
      await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
      await nft.setRewardRate(20);
      
      // Second period with pause
      await ethers.provider.send("evm_increaseTime", [12 * 60 * 60]);
      await nft.pauseStaking();
      await ethers.provider.send("evm_increaseTime", [12 * 60 * 60]);
      
      // Third period with different rate
      await nft.setRewardRate(30);
      await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
      
      // Fourth period with pause and resume
      await nft.pauseStaking();
      await ethers.provider.send("evm_increaseTime", [12 * 60 * 60]);
      await nft.continueStaking();
      
      const rewards = await nft.collectableYieldTokenForOne(0);
      expect(rewards).to.be.gt(0);
    });

    it("Should handle staking with transfers and period changes", async function () {
      await nft.mint(addr1.address, 2, { value: MINT_PRICE * 2n });
      
      // First period
      await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
      await nft.connect(addr1).collectYieldTokenForOne(0);
      
      // Transfer and new period
      await nft.connect(addr1).transferFrom(addr1.address, addr2.address, 0);
      await nft.setRewardRate(20);
      await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
      
      // Collect rewards for both tokens
      await nft.connect(addr2).collectYieldTokenForOne(0);
      await nft.connect(addr1).collectYieldTokenForOne(1);
    });

    it("Should handle staking with zero rewards period", async function () {
      await nft.mint(addr1.address, 1, { value: MINT_PRICE });
      await nft.pauseStaking();
      await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
      const rewards = await nft.collectableYieldTokenForOne(0);
      expect(rewards).to.be.gt(0);
      await nft.continueStaking();
    });

    it("Should handle collecting rewards for all tokens with mixed ownership", async function () {
      await nft.mint(addr1.address, 3, { value: MINT_PRICE * 3n });
      await nft.connect(addr1).transferFrom(addr1.address, addr2.address, 1);
      
      await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
      
      const beforeBalance = await yieldToken.balanceOf(addr1.address);
      await nft.connect(addr1).collectYieldTokenForAll(addr1.address);
      const afterBalance = await yieldToken.balanceOf(addr1.address);
      
      expect(afterBalance).to.be.gt(beforeBalance);
    });
  });

  describe("Edge Cases and Error Conditions", function () {
    it("Should handle interface support checks for all interfaces", async function () {
      // Test all supported interfaces
      expect(await nft.supportsInterface("0x80ac58cd")).to.be.true; // ERC721
      expect(await nft.supportsInterface("0x780e9d63")).to.be.true; // ERC721Enumerable
      expect(await nft.supportsInterface("0x5b5e139f")).to.be.true; // ERC721Metadata
      expect(await nft.supportsInterface("0x00000000")).to.be.false; // Invalid interface
    });

    it("Should handle token transfers with zero rewards", async function () {
      await nft.mint(addr1.address, 1, { value: MINT_PRICE });
      await nft.pauseStaking();
      await nft.connect(addr1).transferFrom(addr1.address, addr2.address, 0);
      await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
      await expect(
        nft.connect(addr2).collectYieldTokenForOne(0)
      ).to.be.revertedWith("claimable token amount is 0");
    });

    it("Should handle multiple transfers within same period", async function () {
      await nft.mint(addr1.address, 1, { value: MINT_PRICE });
      await nft.connect(addr1).transferFrom(addr1.address, addr2.address, 0);
      await nft.connect(addr2).transferFrom(addr2.address, addr1.address, 0);
      await nft.connect(addr1).transferFrom(addr1.address, addr2.address, 0);
      const stakeTime = await nft.tokenIdToStakeTime(0);
      expect(stakeTime).to.be.gt(0);
    });
  });

  describe("Internal Function Coverage", () => {
    it("Should test token existence checks", async () => {
      // Check non-existent token
      expect(await nft.exists(999)).to.be.false;
      
      // Mint and check existing token
      await nft.connect(addr1).mint(addr1.address, 1, { value: ethers.parseEther("0.01") });
      expect(await nft.exists(0)).to.be.true;
    });

    it("Should test update function branches", async () => {
      // Test minting (first-time update)
      await nft.connect(addr1).mint(addr1.address, 1, { value: ethers.parseEther("0.01") });
      const mintTime = await ethers.provider.getBlock("latest");
      expect(await nft.tokenIdToStakeTime(0)).to.equal(mintTime?.timestamp);
      
      // Test transfer (subsequent update)
      await nft.connect(addr1).transferFrom(addr1.address, addr2.address, 0);
      expect(await nft.ownerOf(0)).to.equal(addr2.address);
      
      // Verify reward collection occurred during transfer
      const currentTime = await ethers.provider.getBlock("latest");
      expect(await nft.tokenIdToStakeTime(0)).to.be.gt(mintTime?.timestamp || 0);
    });
  });

  describe("Complex Transfer Scenarios", function () {
    it("Should handle transfers with reward collection correctly", async function () {
      // Mint tokens
      await nft.mint(addr1.address, 2, { value: MINT_PRICE * 2n });
      
      // Advance time to accrue rewards
      await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
      
      // Transfer first token and verify reward collection
      const beforeBalance = await yieldToken.balanceOf(addr1.address);
      await nft.connect(addr1).transferFrom(addr1.address, addr2.address, 0);
      const afterBalance = await yieldToken.balanceOf(addr1.address);
      expect(afterBalance).to.be.gt(beforeBalance);
      
      // Transfer second token back and forth multiple times to test reward collection
      for(let i = 0; i < 3; i++) {
        await nft.connect(addr1).transferFrom(addr1.address, addr2.address, 1);
        await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
        await nft.connect(addr2).transferFrom(addr2.address, addr1.address, 1);
        await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
      }
      
      // Verify stake time updates
      const stakeTime = await nft.tokenIdToStakeTime(1);
      expect(stakeTime).to.be.gt(0);
    });

    it("Should handle transfers with zero rewards", async function () {
      // Mint token
      await nft.mint(addr1.address, 1, { value: MINT_PRICE });
      
      // Transfer immediately (no rewards accrued)
      await nft.connect(addr1).transferFrom(addr1.address, addr2.address, 0);
      
      // Verify stake time was updated
      const stakeTime = await nft.tokenIdToStakeTime(0);
      expect(stakeTime).to.be.gt(0);
    });

    it("Should handle multiple transfers with reward collection", async function () {
      // Mint token
      await nft.mint(addr1.address, 1, { value: MINT_PRICE });
      
      // First period
      await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
      const beforeBalance1 = await yieldToken.balanceOf(addr1.address);
      await nft.connect(addr1).transferFrom(addr1.address, addr2.address, 0);
      const afterBalance1 = await yieldToken.balanceOf(addr1.address);
      expect(afterBalance1).to.be.gt(beforeBalance1);
      
      // Second period
      await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
      const beforeBalance2 = await yieldToken.balanceOf(addr2.address);
      await nft.connect(addr2).transferFrom(addr2.address, addr1.address, 0);
      const afterBalance2 = await yieldToken.balanceOf(addr2.address);
      expect(afterBalance2).to.be.gt(beforeBalance2);
    });
  });
}); 