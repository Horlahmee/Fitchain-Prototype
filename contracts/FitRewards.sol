// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * FitRewards (Prototype)
 * - ERC20 reward token (FIT)
 * - Users can log activity once per day
 * - Tracks streak + lastActivityDay
 *
 * Notes:
 * - For the prototype, we trust users to log honestly (anti-cheat comes later).
 * - This is demo-grade tokenomics: fixed reward per day + simple streak bonus.
 */
contract FitRewards is ERC20, Ownable {
    struct User {
        uint32 lastActivityDay; // day index (UTC)
        uint16 streak;          // consecutive days
        uint128 totalEarned;    // total FIT earned (whole tokens, not wei)
    }

    mapping(address => User) public users;

    uint256 public rewardPerDay = 10;     // 10 FIT per valid day
    uint256 public streakBonusDay = 7;    // bonus kicks in at 7-day streak
    uint256 public streakBonusBps = 2000; // 20% bonus (basis points, 10000 = 100%)

    event ActivityLogged(address indexed user, uint16 newStreak, uint256 mintedWei);

    constructor(address initialOwner) ERC20("FitChain Token", "FIT") Ownable(initialOwner) {}

    /**
     * Log activity once per UTC day.
     * - If user logs yesterday and today consecutively => streak increments
     * - If user misses days => streak resets to 1
     */
    function logActivity() external {
        uint32 today = _dayIndex(block.timestamp);
        User storage u = users[msg.sender];

        require(u.lastActivityDay != today, "Already logged today");

        // Update streak
        if (u.lastActivityDay + 1 == today) {
            // consecutive day
            u.streak += 1;
        } else {
            // first time or missed a day
            u.streak = 1;
        }

        u.lastActivityDay = today;

        // Calculate reward (with optional streak bonus)
        uint256 rewardWhole = rewardPerDay;

        if (u.streak >= streakBonusDay) {
            // Apply bonus: reward = reward * (1 + bonusBps/10000)
            rewardWhole = (rewardWhole * (10_000 + streakBonusBps)) / 10_000;
        }

        u.totalEarned += uint128(rewardWhole);

        // Mint with decimals
        uint256 mintAmountWei = rewardWhole * 10 ** decimals();
        _mint(msg.sender, mintAmountWei);

        emit ActivityLogged(msg.sender, u.streak, mintAmountWei);
    }

    // -------- Admin knobs (for sustainability tuning during prototype) --------

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

    // -------- Internal --------

    function _dayIndex(uint256 ts) internal pure returns (uint32) {
        return uint32(ts / 1 days);
    }
}
