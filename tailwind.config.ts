import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/modules/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Original branding palette — "Yetgin" (yet + tez/tezkor connotation avoided
        // to stay clear of Uzum trademarks). Warm terracotta + deep teal, distinct
        // from competitor palettes.
        brand: {
          50: "#fff4ed",
          100: "#ffe4d3",
          200: "#ffc4a6",
          300: "#ff9c6e",
          400: "#fb6f3a",
          500: "#f24e17",
          600: "#d9370f",
          700: "#b4260f",
          800: "#8f2113",
          900: "#741f13",
        },
        ink: {
          50: "#f4f6f7",
          100: "#e3e8ea",
          200: "#c3ccd1",
          300: "#9aa8ae",
          400: "#70828a",
          500: "#54646c",
          600: "#425058",
          700: "#354048",
          800: "#2b343a",
          900: "#1c2226",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        xl2: "1.25rem",
      },
    },
  },
  plugins: [],
};

export default config;
