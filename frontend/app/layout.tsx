"use client";

import "./globals.css";
import React from "react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { config } from "../wagmi";
import { TabBar } from "./components/TabBar";

const queryClient = new QueryClient();

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ paddingBottom: 96 }}>
        <WagmiProvider config={config}>
          <QueryClientProvider client={queryClient}>
            {children}
            <TabBar />
          </QueryClientProvider>
        </WagmiProvider>
      </body>
    </html>
  );
}
