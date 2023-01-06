// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;


import "@openzeppelin/contracts/utils/Counters.sol";
import "./NftBase.sol";

contract NFT is NftBase {
    using Counters for Counters.Counter;
    Counters.Counter private _tokenIdCounter;
    uint256 public constant MAX_SUPPLY = 10_000;
    uint256 public constant MINT_PRICE = 0.01 ether;
    string internal baseURI;

    bool public publicSaleStatus;

    constructor(
        address _yieldTokenContract,
        string memory _uri
    ) ERC721("NFT", "NFT") {
        setYieldTokenContract(_yieldTokenContract);
        setBaseURI(_uri);
    }

    function _baseURI() internal view override returns (string memory) {
        return baseURI;
    }

    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721)
        returns (string memory)
    {
        require(_exists(tokenId), "NONEXISTENT_TOKEN");
        return super.tokenURI(tokenId);
    }

    function tokenCheck(uint256 tokenId) public view returns (bool) {
        return _exists(tokenId);
    }

    function mint(address _to, uint256 _amount) public payable nonReentrant {
        require(_amount <= 10, "MAX_MINT_PER_TX_IS_10");
        require(msg.value >= _amount * MINT_PRICE, "NOT_ENOUGH_ETH");
        require(_tokenIdCounter.current() + _amount < MAX_SUPPLY, "MINT_OUT");
        require(publicSaleStatus == true, "PUBLIC_SALE_NOT_STARTED");

        for (uint256 index = 0; index < _amount; index++) {
            uint256 tokenId = _tokenIdCounter.current();
            _safeMint(_to, tokenId);
            _tokenIdCounter.increment();
        }
    }

    function safeMint(address to) internal {
        uint256 tokenId = _tokenIdCounter.current();
        require(tokenId < MAX_SUPPLY, "MINT_OUT");
        _safeMint(to, tokenId);
        _tokenIdCounter.increment();
    }

    function togglePublicSaleStatus() public onlyOwner {
        publicSaleStatus = !publicSaleStatus;
    }

    function setBaseURI(string memory _uri) public onlyOwner {
        baseURI = _uri;
    }

    function withdraw() external onlyOwner {
        payable(msg.sender).transfer(address(this).balance);
    }
}