import { defineConfig } from "vitepress";

export default defineConfig({
  title: "pw-backtest",
  description: "Personal TradingView-style replay & backtesting platform",
  lang: "en-US",
  themeConfig: {
    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      { text: "Pine Reference", link: "/guide/pine" },
      { text: "API", link: "/api/" },
    ],
    sidebar: [
      {
        text: "Guide",
        items: [
          { text: "Getting Started", link: "/guide/getting-started" },
          { text: "Charts & Drawings", link: "/guide/charts" },
          { text: "Bar Replay", link: "/guide/replay" },
          { text: "Paper Trading", link: "/guide/paper" },
          { text: "Strategy Backtesting", link: "/guide/backtest" },
          { text: "Pine Script Reference", link: "/guide/pine" },
        ],
      },
      { text: "API", items: [{ text: "REST Endpoints", link: "/api/" }] },
    ],
    socialLinks: [],
    outline: { level: [2, 3] },
  },
});
