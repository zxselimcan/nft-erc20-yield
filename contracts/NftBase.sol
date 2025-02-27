// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IYieldToken is IERC20 {
    function mint(address to, uint256 amount) external;
}

abstract contract NftBase is
    ERC721,
    ERC721Enumerable,
    Ownable,
    ReentrancyGuard
{
    constructor(
        string memory name_,
        string memory symbol_
    ) ERC721(name_, symbol_) Ownable(msg.sender) {}

    IYieldToken public yieldTokenContract;

    uint256 public rewardRate = 1;

    mapping(uint256 => uint256) public tokenIdToStakeTime;

    enum StakingStatus {
        CONTINUE,
        PAUSE
    }

    StakingStatus public stakingStatus;

    struct Period {
        uint256 startTime;
        uint256 endTime;
        uint256 rewardRate;
    }

    Period[] internal _periods;

    function continueStaking() public onlyOwner {
        Period memory period = Period(block.timestamp, 0, rewardRate);
        _periods.push(period);
        stakingStatus = StakingStatus.CONTINUE;
    }

    function pauseStaking() public onlyOwner {
        _periods[_periods.length - 1].endTime = block.timestamp;
        stakingStatus = StakingStatus.PAUSE;
    }

    function setRewardRate(uint256 _rewardRate) external onlyOwner {
        require(_rewardRate > 0 && _rewardRate <= 1000, "Invalid reward rate");
        if (_periods.length > 0) {
            _periods[_periods.length - 1].endTime = block.timestamp;
        }
        rewardRate = _rewardRate;
        Period memory period = Period(block.timestamp, 0, _rewardRate);
        _periods.push(period);
        stakingStatus = StakingStatus.CONTINUE;
    }

    function setYieldTokenContract(address _yieldTokenContract) internal {
        yieldTokenContract = IYieldToken(_yieldTokenContract);
    }

    function collectableYieldTokenForOne(
        uint256 _tokenId
    ) public view returns (uint256) {
        uint256 stakeTime = tokenIdToStakeTime[_tokenId];
        if (stakeTime == 0 || _periods.length == 0) {
            return 0;
        }

        uint256 collectable;
        for (uint256 index = 0; index < _periods.length; index++) {
            Period memory period = _periods[index];

            if (period.endTime != 0 && period.endTime < stakeTime) {
                continue;
            }

            uint256 startTime = stakeTime > period.startTime
                ? stakeTime
                : period.startTime;

            uint256 endTime = period.endTime == 0
                ? block.timestamp
                : period.endTime;

            if (endTime > startTime) {
                uint256 timeElapsed = endTime - startTime;
                uint256 dailyReward = (period.rewardRate * 10 ** 18) / (24 * 60 * 60);
                collectable += (timeElapsed * dailyReward);
            }
        }

        return collectable;
    }

    function collectableYieldTokenForAll(
        address _owner
    ) public view returns (uint256) {
        uint256 total = 0;
        uint256[] memory userWallet = walletOfOwner(_owner);
        for (uint256 index = 0; index < userWallet.length; index++) {
            uint256 tokenId = userWallet[index];
            total += collectableYieldTokenForOne(tokenId);
        }
        return total;
    }

    function _collectYieldTokenForOne(
        uint256 _tokenId
    ) internal returns (uint256) {
        uint256 claimableToken = collectableYieldTokenForOne(_tokenId);
        tokenIdToStakeTime[_tokenId] = block.timestamp;
        yieldTokenContract.mint(ownerOf(_tokenId), claimableToken);
        return claimableToken;
    }

    function collectYieldTokenForOne(
        uint256 _tokenId
    ) public nonReentrant returns (uint256) {
        uint256 claimableToken = collectableYieldTokenForOne(_tokenId);
        require(claimableToken > 0, "claimable token amount is 0");
        return _collectYieldTokenForOne(_tokenId);
    }

    function collectYieldTokenForAll(
        address _owner
    ) public nonReentrant returns (uint256) {
        uint256 total = 0;
        uint256[] memory userWallet = walletOfOwner(_owner);
        uint256 claimableToken = collectableYieldTokenForAll(_owner);
        require(claimableToken > 0, "claimable token amount is 0");
        for (uint256 index = 0; index < userWallet.length; index++) {
            uint256 tokenId = userWallet[index];
            total += _collectYieldTokenForOne(tokenId);
        }
        return total;
    }

    function walletOfOwner(
        address _owner
    ) public view returns (uint256[] memory) {
        uint256 tokenCount = balanceOf(_owner);
        if (tokenCount == 0) {
            return new uint256[](0);
        }

        uint256[] memory tokensId = new uint256[](tokenCount);
        for (uint256 i; i < tokenCount; i++) {
            tokensId[i] = tokenOfOwnerByIndex(_owner, i);
        }
        return tokensId;
    }

    function _increaseBalance(
        address account,
        uint128 amount
    ) internal virtual override(ERC721, ERC721Enumerable) {
        super._increaseBalance(account, amount);
    }

    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal virtual override(ERC721, ERC721Enumerable) returns (address) {
        address from = _ownerOf(tokenId);

        if (from != address(0)) {
            _collectYieldTokenForOne(tokenId);
        } else {
            tokenIdToStakeTime[tokenId] = block.timestamp;
        }

        return super._update(to, tokenId, auth);
    }

    function exists(uint256 tokenId) public view returns (bool) {
        return _ownerOf(tokenId) != address(0);
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC721, ERC721Enumerable) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
