// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;


import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * FitRewards (Upgrade)
 * - Keeps logActivity() for the simple demo loop
 * - Adds claimWithSig() for backend-calculated rewards + daily cap claims
 */
contract FitRewardsClaim is ERC20, Ownable, EIP712 {
    using ECDSA for bytes32;

    struct User {
        uint32 lastActivityDay; // day index (UTC)
        uint16 streak;          // consecutive days
        uint128 totalEarned;    // total FIT earned (whole tokens, not wei)
    }

    mapping(address => User) public users;

    // --- Demo mint knobs (same as before) ---
    uint256 public rewardPerDay = 10;
    uint256 public streakBonusDay = 7;
    uint256 public streakBonusBps = 2000;

    event ActivityLogged(address indexed user, uint16 newStreak, uint256 mintedWei);

    // --- Claim (real app path) ---
    address public rewardSigner; // backend signer (can be owner)
    mapping(address => uint256) public nonces;

    event RewardSignerUpdated(address indexed newSigner);
    event Claimed(address indexed user, uint256 amountWei, bytes32 indexed claimIdHash);

    // EIP-712 typehash:
    // Claim(address to,uint256 amountWei,bytes32 claimIdHash,uint256 nonce,uint256 deadline)
    bytes32 private constant CLAIM_TYPEHASH =
        keccak256("Claim(address to,uint256 amountWei,bytes32 claimIdHash,uint256 nonce,uint256 deadline)");

    constructor(address initialOwner)
        ERC20("FitChain Token", "FIT")
        Ownable(initialOwner)
        EIP712("FitRewards", "1")
    {
        rewardSigner = initialOwner;
        emit RewardSignerUpdated(initialOwner);
    }

    // ---------------- Demo path ----------------
    function logActivity() external {
        uint32 today = _dayIndex(block.timestamp);
        User storage u = users[msg.sender];

        require(u.lastActivityDay != today, "Already logged today");

        if (u.lastActivityDay + 1 == today) {
            u.streak += 1;
        } else {
            u.streak = 1;
        }

        u.lastActivityDay = today;

        uint256 rewardWhole = rewardPerDay;

        if (u.streak >= streakBonusDay) {
            rewardWhole = (rewardWhole * (10_000 + streakBonusBps)) / 10_000;
        }

        u.totalEarned += uint128(rewardWhole);

        uint256 mintAmountWei = rewardWhole * 10 ** decimals();
        _mint(msg.sender, mintAmountWei);

        emit ActivityLogged(msg.sender, u.streak, mintAmountWei);
    }

    // ---------------- Real app claim path ----------------

    function setRewardSigner(address newSigner) external onlyOwner {
        require(newSigner != address(0), "zero address");
        rewardSigner = newSigner;
        emit RewardSignerUpdated(newSigner);
    }

    function claimWithSig(
        uint256 amountWei,
        bytes32 claimIdHash,
        uint256 deadline,
        bytes calldata signature
    ) external {
        require(block.timestamp <= deadline, "expired");
        require(amountWei > 0, "amount=0");

        uint256 nonce = nonces[msg.sender];
        nonces[msg.sender] = nonce + 1;

        bytes32 structHash = keccak256(
            abi.encode(
                CLAIM_TYPEHASH,
                msg.sender,
                amountWei,
                claimIdHash,
                nonce,
                deadline
            )
        );

        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = digest.recover(signature);

        require(signer == rewardSigner, "bad sig");

        _mint(msg.sender, amountWei);

        emit Claimed(msg.sender, amountWei, claimIdHash);
    }

    // -------- Admin knobs (demo tuning) --------

    function setRewardPerDay(uint256 newRewardPerDay) external onlyOwner {
        require(newRewardPerDay > 0 && newRewardPerDay <= 1000, "Out of range");
        rewardPerDay = newRewardPerDay;
    }

    function setStreakBonus(uint256 bonusDay, uint256 bonusBps) external onlyOwner {
        require(bonusDay >= 2 && bonusDay <= 60, "bonusDay out of range");
        require(bonusBps <= 10_000, "bonusBps out of range");
        streakBonusDay = bonusDay;
        streakBonusBps = bonusBps;
    }

    // -------- View helpers --------

    function getUser(address user) external view returns (uint32 lastDay, uint16 streak, uint128 totalEarnedWhole) {
        User memory u = users[user];
        return (u.lastActivityDay, u.streak, u.totalEarned);
    }

    function todayDayIndex() external view returns (uint32) {
        return _dayIndex(block.timestamp);
    }

    function _dayIndex(uint256 ts) internal pure returns (uint32) {
        return uint32(ts / 1 days);
    }
}
