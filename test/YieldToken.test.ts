import { expect } from "chai";
import { ethers } from "hardhat";
import { YieldToken } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("YieldToken Contract", () => {
  let yieldToken: YieldToken;
  let owner: SignerWithAddress;
  let addr1: SignerWithAddress;
  let addr2: SignerWithAddress;
  let minter: SignerWithAddress;

  beforeEach(async () => {
    [owner, addr1, addr2, minter] = await ethers.getSigners();
    
    const YieldToken = await ethers.getContractFactory("YieldToken");
    yieldToken = await YieldToken.deploy();
    await yieldToken.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await yieldToken.hasRole(await yieldToken.DEFAULT_ADMIN_ROLE(), owner.address)).to.equal(true);
    });

    it("Should set the right name and symbol", async function () {
      expect(await yieldToken.name()).to.equal("YIELD");
      expect(await yieldToken.symbol()).to.equal("YIELD");
    });

    it("Should have 0 initial supply", async function () {
      expect(await yieldToken.totalSupply()).to.equal(0);
    });
  });

  describe("Role Management", function () {
    it("Should grant minter role correctly", async function () {
      await yieldToken.grantMinterRole(minter.address);
      expect(await yieldToken.hasRole(await yieldToken.MINTER_ROLE(), minter.address)).to.equal(true);
    });

    it("Should revoke minter role correctly", async function () {
      await yieldToken.grantMinterRole(minter.address);
      await yieldToken.revokeMinterRole(minter.address);
      expect(await yieldToken.hasRole(await yieldToken.MINTER_ROLE(), minter.address)).to.equal(false);
    });

    it("Should not allow non-admin to grant minter role", async function () {
      await expect(
        yieldToken.connect(addr1).grantMinterRole(addr2.address)
      ).to.be.reverted;
    });

    it("Should not allow non-admin to revoke minter role", async function () {
      await yieldToken.grantMinterRole(minter.address);
      await expect(
        yieldToken.connect(addr1).revokeMinterRole(minter.address)
      ).to.be.reverted;
    });
  });

  describe("Minting", function () {
    beforeEach(async function () {
      await yieldToken.grantMinterRole(minter.address);
    });

    it("Should allow minter to mint tokens", async function () {
      const mintAmount = ethers.parseEther("100");
      await yieldToken.connect(minter).mint(addr1.address, mintAmount);
      expect(await yieldToken.balanceOf(addr1.address)).to.equal(mintAmount);
    });

    it("Should increase total supply when minting", async function () {
      const mintAmount = ethers.parseEther("100");
      await yieldToken.connect(minter).mint(addr1.address, mintAmount);
      expect(await yieldToken.totalSupply()).to.equal(mintAmount);
    });

    it("Should not allow non-minter to mint tokens", async function () {
      const mintAmount = ethers.parseEther("100");
      await expect(
        yieldToken.connect(addr1).mint(addr2.address, mintAmount)
      ).to.be.reverted;
    });

    it("Should emit Transfer event when minting", async function () {
      const mintAmount = ethers.parseEther("100");
      await expect(yieldToken.connect(minter).mint(addr1.address, mintAmount))
        .to.emit(yieldToken, "Transfer")
        .withArgs(ethers.ZeroAddress, addr1.address, mintAmount);
    });
  });

  describe("Token Transfers", function () {
    const mintAmount = ethers.parseEther("1000");
    
    beforeEach(async function () {
      await yieldToken.grantMinterRole(minter.address);
      await yieldToken.connect(minter).mint(addr1.address, mintAmount);
    });

    it("Should transfer tokens correctly", async function () {
      const transferAmount = ethers.parseEther("100");
      await yieldToken.connect(addr1).transfer(addr2.address, transferAmount);
      
      expect(await yieldToken.balanceOf(addr1.address)).to.equal(mintAmount - transferAmount);
      expect(await yieldToken.balanceOf(addr2.address)).to.equal(transferAmount);
    });

    it("Should emit Transfer event when transferring", async function () {
      const transferAmount = ethers.parseEther("100");
      await expect(yieldToken.connect(addr1).transfer(addr2.address, transferAmount))
        .to.emit(yieldToken, "Transfer")
        .withArgs(addr1.address, addr2.address, transferAmount);
    });

    it("Should not allow transfer more than balance", async function () {
      const excessAmount = mintAmount + ethers.parseEther("1");
      await expect(
        yieldToken.connect(addr1).transfer(addr2.address, excessAmount)
      ).to.be.reverted;
    });

    it("Should allow transferFrom with approval", async function () {
      const approveAmount = ethers.parseEther("500");
      const transferAmount = ethers.parseEther("200");
      
      await yieldToken.connect(addr1).approve(addr2.address, approveAmount);
      await yieldToken.connect(addr2).transferFrom(addr1.address, addr2.address, transferAmount);
      
      expect(await yieldToken.balanceOf(addr1.address)).to.equal(mintAmount - transferAmount);
      expect(await yieldToken.balanceOf(addr2.address)).to.equal(transferAmount);
      expect(await yieldToken.allowance(addr1.address, addr2.address)).to.equal(approveAmount - transferAmount);
    });

    it("Should not allow transferFrom without approval", async function () {
      const transferAmount = ethers.parseEther("100");
      await expect(
        yieldToken.connect(addr2).transferFrom(addr1.address, addr2.address, transferAmount)
      ).to.be.reverted;
    });

    it("Should not allow transferFrom more than approved", async function () {
      const approveAmount = ethers.parseEther("100");
      const transferAmount = ethers.parseEther("200");
      
      await yieldToken.connect(addr1).approve(addr2.address, approveAmount);
      await expect(
        yieldToken.connect(addr2).transferFrom(addr1.address, addr2.address, transferAmount)
      ).to.be.reverted;
    });
  });

  describe("Approval", function () {
    it("Should approve correctly", async function () {
      const approveAmount = ethers.parseEther("100");
      await yieldToken.connect(addr1).approve(addr2.address, approveAmount);
      expect(await yieldToken.allowance(addr1.address, addr2.address)).to.equal(approveAmount);
    });

    it("Should emit Approval event when approving", async function () {
      const approveAmount = ethers.parseEther("100");
      await expect(yieldToken.connect(addr1).approve(addr2.address, approveAmount))
        .to.emit(yieldToken, "Approval")
        .withArgs(addr1.address, addr2.address, approveAmount);
    });
  });

  describe("ERC20 Metadata", function () {
    it("Should have correct decimals", async function () {
      expect(await yieldToken.decimals()).to.equal(18);
    });
  });

  describe("Constructor Initialization", function () {
    it("Should initialize with correct roles", async function () {
      // Verify admin role is set to deployer
      expect(await yieldToken.hasRole(await yieldToken.DEFAULT_ADMIN_ROLE(), owner.address)).to.be.true;
      
      // Verify minter role is set to deployer initially
      expect(await yieldToken.hasRole(await yieldToken.MINTER_ROLE(), owner.address)).to.be.true;
      expect(await yieldToken.hasRole(await yieldToken.MINTER_ROLE(), addr1.address)).to.be.false;
    });

    it("Should initialize with correct token metadata", async function () {
      expect(await yieldToken.name()).to.equal("YIELD");
      expect(await yieldToken.symbol()).to.equal("YIELD");
      expect(await yieldToken.decimals()).to.equal(18);
    });
  });
}); 