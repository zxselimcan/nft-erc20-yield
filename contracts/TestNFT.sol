// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import "./NFT.sol";

contract TestNFT is NFT {
    constructor(address _yieldTokenContract, string memory _uri) NFT(_yieldTokenContract, _uri) {}

    function testSafeMint(address to) public {
        safeMint(to);
    }
} 