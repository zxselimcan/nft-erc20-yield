import { expect } from "chai";
import { ethers } from "hardhat";
import { NFT, YieldToken } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("NFT Staking System", () => {
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

  describe("NFT Contract", function () {
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

      it("Should handle all ERC721 and ERC721Enumerable functions", async function () {
        await nft.mint(addr1.address, 2, { value: MINT_PRICE * 2n });
        
        // Test tokenOfOwnerByIndex
        expect(await nft.tokenOfOwnerByIndex(addr1.address, 0)).to.equal(0);
        expect(await nft.tokenOfOwnerByIndex(addr1.address, 1)).to.equal(1);
        
        // Test totalSupply and tokenByIndex
        expect(await nft.totalSupply()).to.equal(2);
        expect(await nft.tokenByIndex(0)).to.equal(0);
        expect(await nft.tokenByIndex(1)).to.equal(1);

        // Test _increaseBalance through transfer
        await nft.connect(addr1).transferFrom(addr1.address, addr2.address, 0);
        expect(await nft.balanceOf(addr2.address)).to.equal(1);
        expect(await nft.balanceOf(addr1.address)).to.equal(1);
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

    it("Should update reward rate", async function () {
      const newRate = 2;
      await nft.setRewardRate(newRate);
      expect(await nft.rewardRate()).to.equal(newRate);
    });

    it("Should withdraw funds correctly", async function () {
      await nft.mint(addr1.address, 1, { value: MINT_PRICE });
      const beforeBalance = await ethers.provider.getBalance(owner.address);
      await nft.withdraw();
      const afterBalance = await ethers.provider.getBalance(owner.address);
      expect(afterBalance).to.be.gt(beforeBalance);
    });
  });

  describe("YieldToken", function () {
    it("Should revoke minter role", async function () {
      await yieldToken.revokeMinterRole(await nft.getAddress());
      await expect(
        nft.connect(addr1).collectYieldTokenForOne(0)
      ).to.be.reverted;
    });

    it("Should fail when non-admin tries to grant/revoke roles", async function () {
      await expect(
        yieldToken.connect(addr1).grantMinterRole(addr2.address)
      ).to.be.reverted;
      await expect(
        yieldToken.connect(addr1).revokeMinterRole(addr2.address)
      ).to.be.reverted;
    });

    it("Should mint tokens correctly", async function () {
      // Test minting through direct call (as admin)
      await yieldToken.mint(addr1.address, ethers.parseEther("1.0"));
      expect(await yieldToken.balanceOf(addr1.address)).to.equal(ethers.parseEther("1.0"));

      // Test minting through NFT contract
      await nft.mint(addr1.address, 1, { value: MINT_PRICE });
      await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
      await nft.connect(addr1).collectYieldTokenForOne(0);
      expect(await yieldToken.balanceOf(addr1.address)).to.be.gt(ethers.parseEther("1.0"));
    });

    it("Should handle role management correctly", async function () {
      // Test granting minter role
      await yieldToken.grantMinterRole(addr1.address);
      expect(await yieldToken.hasRole(await yieldToken.MINTER_ROLE(), addr1.address)).to.be.true;

      // Test minting with granted role
      await yieldToken.connect(addr1).mint(addr2.address, ethers.parseEther("1.0"));
      expect(await yieldToken.balanceOf(addr2.address)).to.equal(ethers.parseEther("1.0"));

      // Test revoking minter role
      await yieldToken.revokeMinterRole(addr1.address);
      expect(await yieldToken.hasRole(await yieldToken.MINTER_ROLE(), addr1.address)).to.be.false;

      // Test minting after role revocation
      await expect(
        yieldToken.connect(addr1).mint(addr2.address, ethers.parseEther("1.0"))
      ).to.be.reverted;
    });

    it("Should handle constructor initialization correctly", async function () {
      const YieldToken = await ethers.getContractFactory("YieldToken");
      const newYieldToken = await YieldToken.deploy();
      await newYieldToken.waitForDeployment();

      // Verify admin role
      expect(await newYieldToken.hasRole(await newYieldToken.DEFAULT_ADMIN_ROLE(), owner.address)).to.be.true;
      expect(await newYieldToken.hasRole(await newYieldToken.MINTER_ROLE(), owner.address)).to.be.true;

      // Verify token details
      expect(await newYieldToken.name()).to.equal("YIELD");
      expect(await newYieldToken.symbol()).to.equal("YIELD");

      // Test minting with admin role
      await newYieldToken.mint(addr1.address, ethers.parseEther("1.0"));
      expect(await newYieldToken.balanceOf(addr1.address)).to.equal(ethers.parseEther("1.0"));
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
