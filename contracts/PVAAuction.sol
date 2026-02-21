// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function decimals() external view returns (uint8);
}

contract PVAAuction {
    IERC20 public immutable usdt;
    address public immutable treasury;

    uint256 public constant PLATFORM_FEE_BPS = 150;
    uint256 public constant BPS_DENOM = 10_000;
    uint256 public constant MIN_BUY_USDT = 20 * 1e6;
    uint256 public constant LOCK_TIME = 3 hours;

    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 ether;
    uint256 public constant PARTS = 100;
    uint256 public constant PART_SIZE = TOTAL_SUPPLY / PARTS;

    enum League { Silver, Gold, Diamond }

    struct Position {
        address owner;
        uint256 amountTokens;
        uint256 buyPrice;
        uint256 createdAt;
        uint256 unlockAt;
        uint8   partId;
        League  league;
        bool    closed;
    }

    Position[] public positions;

    event Buy(address indexed user, uint256 indexed positionId, uint256 usdtAmount, uint256 amountTokens, uint8 partId, League league);
    event Sell(address indexed user, uint256 indexed positionId, uint256 usdtNet, uint256 fee);
    event Withdraw(address indexed to, uint256 amount);

    constructor(address usdtToken, address treasuryWallet) {
        require(usdtToken != address(0), "USDT address zero");
        require(treasuryWallet != address(0), "Treasury address zero");
        usdt = IERC20(usdtToken);
        treasury = treasuryWallet;
    }

    function leagueByPrice(uint256 priceUSDT6) public pure returns (League) {
        if (priceUSDT6 < 10**5) {
            return League.Silver;
        }
        if (priceUSDT6 < 10**6) {
            return League.Gold;
        }
        return League.Diamond;
    }

    function currentPrice() public pure returns (uint256) {
        return 10**4; // 0.01 USDT (6 decimals)
    }

    function buyTokens(uint256 usdtAmount) external returns (uint256 positionId) {
        require(usdtAmount >= MIN_BUY_USDT, "Min 20 USDT");
        uint256 priceUSDT6 = currentPrice();

        require(usdt.transferFrom(msg.sender, address(this), usdtAmount), "USDT transfer failed");

        uint256 amountTokens = (usdtAmount * 1e18) / priceUSDT6;

        uint8 partId = 1;
        League lg = leagueByPrice(priceUSDT6);

        Position memory p = Position({
            owner: msg.sender,
            amountTokens: amountTokens,
            buyPrice: priceUSDT6,
            createdAt: block.timestamp,
            unlockAt: block.timestamp + LOCK_TIME,
            partId: partId,
            league: lg,
            closed: false
        });

        positions.push(p);
        positionId = positions.length - 1;

        emit Buy(msg.sender, positionId, usdtAmount, amountTokens, partId, lg);
    }

    function sellPosition(uint256 positionId) external {
        require(positionId < positions.length, "Bad id");
        Position storage p = positions[positionId];
        require(!p.closed, "Closed");
        require(p.owner == msg.sender, "Not owner");
        require(block.timestamp >= p.unlockAt, "Locked");

        uint256 pctBps;
        if (p.league == League.Silver) {
            pctBps = 1000;
        } else if (p.league == League.Gold) {
            pctBps = 750;
        } else {
            pctBps = 500;
        }

        uint256 sellPrice = p.buyPrice + (p.buyPrice * pctBps) / BPS_DENOM;
        uint256 grossUSDT = (p.amountTokens * sellPrice) / 1e18;

        uint256 fee = (grossUSDT * PLATFORM_FEE_BPS) / BPS_DENOM;
        uint256 net = grossUSDT - fee;

        p.closed = true;

        require(usdt.transfer(msg.sender, net), "USDT transfer net failed");
        require(usdt.transfer(treasury, fee), "USDT transfer fee failed");

        emit Sell(msg.sender, positionId, net, fee);
    }

    function getPositionsLength() external view returns (uint256) {
        return positions.length;
    }

    function getPosition(uint256 positionId) external view returns (Position memory) {
        require(positionId < positions.length, "Bad id");
        return positions[positionId];
    }

    function emergencyWithdraw(uint256 amount) external {
        require(msg.sender == treasury, "Only treasury");
        require(usdt.transfer(treasury, amount), "Withdraw failed");
        emit Withdraw(treasury, amount);
    }
}
