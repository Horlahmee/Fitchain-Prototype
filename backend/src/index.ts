import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { prisma } from "./db.js";
import stravaRoutes from "./routes/strava.js";
import connectionRoutes from "./routes/connections.js";
import stravaSyncRoutes from "./routes/stravaSync.js";
import stravaDebugRoutes from "./routes/stravaDebug.js";
import claimRoutes from "./routes/claim.js";
import mockRoutes from "./routes/mock.js";
import walletRoutes from "./routes/wallet.js";
import marketplaceRoutes from "./routes/marketplace.js";
import badgeRoutes from "./routes/badges.js";
import providersRoutes from "./routes/providers.js";
import activitiesRoutes from "./routes/activities.js";
import authRoutes from "./routes/auth.js";
import meRoutes from "./routes/me.js";
import { ethers } from "ethers";






dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

/**
 * POST /claim/sign
 * body: { wallet: string, claimId: string }
 * returns: { ok, amountWei, claimIdHash, deadline, nonce, signature }
 */
app.post("/claim/sign", async (req, res) => {
  try {
    const walletRaw = String(req.body.wallet || "").trim();
if (!ethers.isAddress(walletRaw)) {
  return res.status(400).json({ error: "invalid wallet address" });
}
const wallet = ethers.getAddress(walletRaw); // checksums it

    const claimId = String(req.body.claimId || "");

    if (!wallet || !wallet.startsWith("0x")) {
      return res.status(400).json({ error: "wallet required" });
    }
    if (!claimId) {
      return res.status(400).json({ error: "claimId required" });
    }

    const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
    const contractAddress = process.env.FITREWARDS_CLAIM_ADDRESS;
    const pk = process.env.SIGNER_PRIVATE_KEY;

    if (!contractAddress) return res.status(500).json({ error: "missing FITREWARDS_CLAIM_ADDRESS" });
    if (!pk) return res.status(500).json({ error: "missing SIGNER_PRIVATE_KEY" });

    // 1) Fetch claim from DB + validate it belongs to this wallet + status
    const claim = await prisma.rewardClaim.findUnique({
      where: { id: claimId },
      include: { user: true },
    });

    if (!claim) return res.status(404).json({ error: "claim not found" });
    const dbWallet = claim.user?.wallet ? claim.user.wallet.trim() : "";
if (!dbWallet || !ethers.isAddress(dbWallet) || ethers.getAddress(dbWallet) !== wallet) {
  return res.status(403).json({ error: "claim wallet mismatch" });
}
  
    if (claim.status !== "PENDING") {
      return res.status(400).json({ error: `claim status is ${claim.status}` });
    }

    const amountFit = Number(claim.amountFit || 0);
    if (!amountFit || amountFit <= 0) {
      return res.status(400).json({ error: "amountFit is 0" });
    }

    // Convert FIT (with up to 6 decimals) → wei
    const amountWei = ethers.parseUnits(amountFit.toFixed(6), 18);

    // 2) Read nonce from contract
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const minimalAbi = ["function nonces(address) view returns (uint256)"];
    const c = new ethers.Contract(contractAddress, minimalAbi, provider) as any;
    const nonce = await c.nonces(wallet);

    // 3) Build typed data (MUST match contract exactly)
    const chainId = 84532; // Base Sepolia
    const deadline = Math.floor(Date.now() / 1000) + 10 * 60; // 10 minutes from now
    const claimIdHash = ethers.id(claimId); // keccak256(utf8(claimId))

    const domain = {
      name: "FitRewards",
      version: "1",
      chainId,
      verifyingContract: contractAddress,
    } as const;

    const types = {
      Claim: [
        { name: "to", type: "address" },
        { name: "amountWei", type: "uint256" },
        { name: "claimIdHash", type: "bytes32" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    };

    const value = {
      to: wallet,
      amountWei,
      claimIdHash,
      nonce,
      deadline,
    };

    // 4) Sign typed data with backend signer key
    const signer = new ethers.Wallet(pk.startsWith("0x") ? pk : `0x${pk}`);
    const signature = await signer.signTypedData(domain, types, value);

    return res.json({
      ok: true,
      amountWei: amountWei.toString(),
      claimIdHash,
      deadline,
      nonce: nonce.toString(),
      signature,
    });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: e?.message || "sign failed" });
  }
});

app.use(connectionRoutes);
app.use(stravaSyncRoutes);
app.use(stravaDebugRoutes);

// Register core routes early
app.use(authRoutes);
app.use(meRoutes);

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    name: "fitchain-backend",
    time: new Date().toISOString(),
  });
});

app.post("/me", async (req, res) => {
  try {
    const wallet = String(req.body?.wallet || "").toLowerCase();

    if (!wallet || !wallet.startsWith("0x") || wallet.length < 10) {
      return res.status(400).json({ error: "Valid wallet required" });
    }

    const user = await prisma.user.upsert({
      where: { wallet },
      update: {},
      create: { wallet },
    });

    return res.json({ user });
  } catch (err) {
    console.error("POST /me error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

const port = Number(process.env.PORT || 4000);
app.use(stravaRoutes);
app.use(claimRoutes);
app.use(walletRoutes);
app.use(marketplaceRoutes);
app.use(badgeRoutes);
app.use(providersRoutes);
app.use(activitiesRoutes);
app.use(mockRoutes);


app.listen(port, () => {
  console.log(`✅ API running on http://localhost:${port}`);
});
