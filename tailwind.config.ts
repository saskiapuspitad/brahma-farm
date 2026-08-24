import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f0f9f4", 100: "#dcf0e3", 500: "#2f9e5b", 600: "#268049", 700: "#1f6b3d",
        },
      },
    },
  },
  plugins: [],
};

export default config;
