// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import "./NftBase.sol";

contract NFT is NftBase {
    uint256 private _tokenIdCounter;
    uint256 public constant MAX_SUPPLY = 10_000;
    uint256 public constant MINT_PRICE = 0.01 ether;
    string internal baseURI;

    bool public publicSaleStatus;

    constructor(
        address _yieldTokenContract,
        string memory _uri
    ) NftBase("NFT", "NFT") {
        setYieldTokenContract(_yieldTokenContract);
        setBaseURI(_uri);
    }

    function _baseURI() internal view override returns (string memory) {
        return baseURI;
    }

    function tokenURI(
        uint256 tokenId
    ) public view override(ERC721) returns (string memory) {
        _requireOwned(tokenId);
        return super.tokenURI(tokenId);
    }

    function tokenCheck(uint256 tokenId) public view returns (bool) {
        return super._requireOwned(tokenId) != address(0);
    }

    function mint(address _to, uint256 _amount) public payable nonReentrant {
        require(_amount <= 10, "MAX_MINT_PER_TX_IS_10");
        require(msg.value >= _amount * MINT_PRICE, "NOT_ENOUGH_ETH");
        require(_tokenIdCounter + _amount < MAX_SUPPLY, "MINT_OUT");
        require(publicSaleStatus == true, "PUBLIC_SALE_NOT_STARTED");

        for (uint256 index = 0; index < _amount; index++) {
            uint256 tokenId = _tokenIdCounter;
            _safeMint(_to, tokenId);
            _tokenIdCounter++;
        }
    }

    function safeMint(address to) internal {
        uint256 tokenId = _tokenIdCounter;
        require(tokenId < MAX_SUPPLY, "MINT_OUT");
        _safeMint(to, tokenId);
        _tokenIdCounter++;
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
