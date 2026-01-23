# FitChain Prototype — Onchain Fitness Rewards (Base Sepolia)

FitChain is a simple **onchain fitness tracker prototype** built on **Base Sepolia**.

The core demo flow:
1. Connect wallet
2. Start a **30-second workout** (demo timer)
3. Confirm activity
4. Mint **FIT** tokens onchain
5. Dashboard updates with balance + streak + latest transaction UI

This repo is built as a **grant-ready prototype** to validate the UX and onchain reward flow before expanding into a full mobile experience.

---

## ✨ What’s Working in This Prototype

- ✅ Wallet connect (Wagmi)
- ✅ Base Sepolia network detection + **Switch Network banner**
- ✅ 30s workout demo timer
- ✅ Onchain `logActivity()` call via MetaMask
- ✅ FIT token minting + dashboard display
- ✅ Transaction modal overlay (Step 1/2/3) + confetti
- ✅ Latest Tx mini card (persistent, user-closeable)
- ✅ Toast notifications + BaseScan links

---

## 🧱 Tech Stack

- **Smart Contracts:** Solidity + Hardhat
- **Frontend:** Next.js (App Router) + React
- **Web3:** Wagmi + Viem
- **Network:** Base Sepolia (chainId: `84532`)

---

## 📦 Repo Structure

```

fitchain-prototype/
contracts/               # Solidity contracts
scripts/                 # Hardhat deploy + interaction scripts
frontend/                # Next.js frontend app

````

---

## ✅ Prerequisites

Installed versions used during development:
- Node.js `v24.x`
- npm `11.x`
- Git `2.x`

You’ll also need:
- MetaMask (or another EVM wallet)
- Base Sepolia test ETH (via faucet)

---

## 🔧 Setup (Local Dev)

### 1) Clone the repo
```bash
git clone https://github.com/Horlahmee/Fitchain-Prototype.git
cd Fitchain-Prototype
````

### 2) Install contract dependencies

```bash
npm install
```

### 3) Install frontend dependencies

```bash
cd frontend
npm install
```

### 4) Run the frontend

```bash
npm run dev
```

Then open:

* [http://localhost:3000](http://localhost:3000)

---

## 🧪 Base Sepolia Setup

### Add Base Sepolia to your wallet

Network details:

* **Network Name:** Base Sepolia
* **Chain ID:** 84532
* **RPC:** [https://sepolia.base.org](https://sepolia.base.org)
* **Explorer:** [https://sepolia.basescan.org](https://sepolia.basescan.org)

### Get test ETH

Use the Base faucet (or any Base Sepolia faucet):

* [https://faucet.base.org](https://faucet.base.org)

---

## 🔨 Smart Contract (Hardhat)

### Compile

From repo root:

```bash
npx hardhat compile
```

### Deploy (Base Sepolia)

```bash
npx hardhat run scripts/deploy.js --network baseSepolia
```

After deployment, update the frontend contract address:

**File:**
`frontend/app/page.tsx`

**Replace:**

```ts
const CONTRACT_ADDRESS = "0x..." as const;
```

---

## 🎬 Demo Walkthrough

1. Launch the frontend: `npm run dev`
2. Connect wallet
3. If network is not Base Sepolia → click **Switch to Base Sepolia**
4. Click **Start Workout (30s)** and wait for countdown
5. Click **Confirm Activity ✅**
6. Confirm in MetaMask
7. Watch:

   * transaction modal progress
   * success confetti
   * FIT balance update
   * latest tx card + BaseScan link

---

## 🧠 Notes / Next Steps

This is an MVP demo. Planned upgrades:

* Tokenomics implementation (caps, multipliers, burn logic)
* Anti-cheat signals (device + GPS validation)
* Activity proofs (oracle / attestation approach)
* Mobile-first UI + React Native app
* Social challenges, leaderboards, streak badges
* Brand partnerships and rewards marketplace

---

## 🔐 Security

* Never commit `.env` (private keys) to git.
* Use a separate test wallet for Base Sepolia.
* This is an early prototype — **not audited**.

---

## 📄 License

MIT (or TBD)

---

## 👤 Author

Built by **Olamidipupo (Horlahmee)**
X: [https://x.com/Horlahmee023](https://x.com/Horlahmee023)

```

---

