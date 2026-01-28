import { http, createConfig } from "wagmi";
import { baseSepolia, mainnet, sepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";

// Include common chains so wagmi detects when you switch away
// (so the network banner can re-appear).
export const config = createConfig({
  chains: [baseSepolia, sepolia, mainnet],
  connectors: [injected()],
  transports: {
    [baseSepolia.id]: http("https://sepolia.base.org"),
    [sepolia.id]: http("https://ethereum-sepolia.publicnode.com"),
    [mainnet.id]: http("https://cloudflare-eth.com"),
  },
});
