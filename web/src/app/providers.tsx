"use client";

import { RainbowKitProvider, darkTheme, lightTheme } from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { wagmiConfig } from "@/config/wagmi";
import { ToastProvider } from "@/components/Toast";
import "@rainbow-me/rainbowkit/styles.css";

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  // Track the site theme so RainbowKit's modal matches light/dark.
  const [isDark, setIsDark] = useState(true);
  useEffect(() => {
    const read = () =>
      setIsDark((document.documentElement.getAttribute("data-theme") || "dark") !== "light");
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  const rainbowTheme = isDark
    ? darkTheme({ accentColor: "#ec2f8b", borderRadius: "medium" })
    : lightTheme({ accentColor: "#ec2f8b", borderRadius: "medium" });

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={rainbowTheme} modalSize="compact">
          <ToastProvider>{children}</ToastProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
