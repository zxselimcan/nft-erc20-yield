# ChronoStake

A Solidity-based NFT staking system that rewards NFT holders with ERC20 tokens over time. This project demonstrates how to implement a time-based staking mechanism where NFT holders earn yield tokens proportional to their holding period.

## Overview

This project consists of three main smart contracts:

1. **NFT.sol**: An ERC721 token with staking capabilities
2. **NftBase.sol**: Base contract that implements the staking logic
3. **YieldToken.sol**: An ERC20 token that is minted as rewards for stakers

The system allows users to:

- Mint NFTs
- Earn yield tokens automatically by holding NFTs
- Collect accrued yield tokens at any time
- Transfer NFTs (which automatically collects rewards)

## Features

- **Time-based Rewards**: NFT holders earn yield tokens based on how long they've held their NFTs
- **Adjustable Reward Rates**: Admin can change the reward rate at any time
- **Staking Periods**: Supports multiple staking periods with different reward rates
- **Pause/Resume Staking**: Admin can pause and resume the staking mechanism
- **Automatic Reward Collection**: Rewards are automatically collected when NFTs are transferred
- **Batch Operations**: Collect rewards for all owned NFTs in a single transaction

## Smart Contracts

### NFT.sol

The main NFT contract that users interact with. It extends NftBase and implements:

- Minting functionality (with a price of 0.01 ETH per NFT)
- Maximum supply of 10,000 NFTs
- Public sale toggle
- Admin functions for managing the contract

### NftBase.sol

The core staking logic that:

- Tracks staking periods and reward rates
- Calculates rewards based on holding time
- Manages the collection of rewards
- Handles NFT transfers with automatic reward collection

### YieldToken.sol

A standard ERC20 token with:

- Role-based access control
- Minting functionality restricted to authorized minters (the NFT contract)

## Technical Details

### Staking Mechanism

The staking system works by:

1. Recording the timestamp when an NFT is minted or transferred
2. Tracking different staking periods with their respective reward rates
3. Calculating rewards based on the formula: `timeElapsed * dailyReward`
4. Where `dailyReward = (rewardRate * 10^18) / (24 * 60 * 60)`

### Reward Collection

Rewards can be collected in three ways:

1. Manually for a single NFT using `collectYieldTokenForOne(tokenId)`
2. In batch for all owned NFTs using `collectYieldTokenForAll(address)`
3. Automatically when transferring an NFT (rewards are sent to the previous owner)

## Getting Started

### Prerequisites

- Node.js v16+ (Note: v23.7.0 is used but not officially supported by Hardhat)
- npm or yarn
- Hardhat

### Installation

1. Clone the repository:

```bash
git clone https://github.com/zxselimcan/chronostake.git
cd chronostake
```

2. Install dependencies:

```bash
npm install
```

### Compilation

```bash
npx hardhat compile
```

### Testing

Run the comprehensive test suite:

```bash
npx hardhat test
```

For test coverage:

```bash
npx hardhat coverage
```

## Deployment

1. Set up your environment variables in a `.env` file:

```
PRIVATE_KEY=your_private_key
INFURA_API_KEY=your_infura_api_key
ETHERSCAN_API_KEY=your_etherscan_api_key
```

2. Deploy to a network:

```bash
npx hardhat run scripts/deploy.js --network <network_name>
```

## Usage Examples

### Minting NFTs

```javascript
// Connect to the NFT contract
const nftContract = await ethers.getContractAt("NFT", nftContractAddress);

// Mint 2 NFTs for 0.02 ETH
await nftContract.mint(receiverAddress, 2, {
  value: ethers.parseEther("0.02"),
});
```

### Checking Rewards

```javascript
// Check rewards for a specific NFT
const rewards = await nftContract.collectableYieldTokenForOne(tokenId);
console.log(`Claimable rewards: ${ethers.formatEther(rewards)} YIELD`);

// Check rewards for all NFTs owned by an address
const totalRewards =
  await nftContract.collectableYieldTokenForAll(ownerAddress);
console.log(
  `Total claimable rewards: ${ethers.formatEther(totalRewards)} YIELD`
);
```

### Collecting Rewards

```javascript
// Collect rewards for a specific NFT
await nftContract.collectYieldTokenForOne(tokenId);

// Collect rewards for all owned NFTs
await nftContract.collectYieldTokenForAll(ownerAddress);
```

### Admin Functions

```javascript
// Toggle public sale status
await nftContract.togglePublicSaleStatus();

// Update reward rate (value between 1-1000)
await nftContract.setRewardRate(20);

// Pause staking
await nftContract.pauseStaking();

// Resume staking
await nftContract.continueStaking();

// Update base URI
await nftContract.setBaseURI("ipfs://newCID/");

// Withdraw contract funds
await nftContract.withdraw();
```
