import type { Config } from "tailwindcss";

// Playful/colorful platform-wide palette: orange primary for CTAs, purple
// accent for links/focus/secondary elements, warm cream background instead
// of stark white. Applies everywhere (admin console now; org portal and
// storefront in later phases reuse the same tokens).
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#FFF4ED",
          100: "#FFE6D5",
          200: "#FFC9A8",
          300: "#FFA268",
          400: "#FF8145",
          500: "#FF6B35",
          600: "#F04E12",
          700: "#C93A0B",
          800: "#9F2F0E",
          900: "#7A2610",
        },
        accent: {
          50: "#F3F0FF",
          100: "#E5DEFF",
          200: "#CBBBFF",
          300: "#AA8FFF",
          400: "#8F6BFA",
          500: "#7C4DFF",
          600: "#6633E0",
          700: "#5226B8",
          800: "#3F1D8F",
          900: "#301670",
        },
        cream: "#FFFBF5",
      },
      fontFamily: {
        heading: ["var(--font-heading)"],
        sans: ["var(--font-body)"],
      },
      borderRadius: {
        xl2: "1.25rem",
      },
    },
  },
  plugins: [],
};

export default config;
