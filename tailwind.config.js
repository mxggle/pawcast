/**
 * Theme shades resolve from runtime CSS variables, so Tailwind can't inject an
 * alpha channel into the color string itself (`color-mix(...)` has no
 * `<alpha-value>` slot). Function values let `/opacity` modifiers compile to a
 * color-mix toward transparent — with a plain string they are silently dropped.
 */
const withAlpha = (color) => ({ opacityValue }) =>
  opacityValue === undefined
    ? color
    : `color-mix(in srgb, ${color} calc(${opacityValue} * 100%), transparent)`;

const mix = (variable, tone, percent) =>
  withAlpha(`color-mix(in srgb, var(${variable}), ${tone} ${percent}%)`);

const themeScale = (variable) => ({
  DEFAULT: `rgb(var(${variable}-rgb) / <alpha-value>)`,
  50: mix(variable, "white", 95),
  100: mix(variable, "white", 90),
  200: mix(variable, "white", 70),
  300: mix(variable, "white", 50),
  400: mix(variable, "white", 20),
  500: withAlpha(`var(${variable})`),
  600: mix(variable, "black", 10),
  700: mix(variable, "black", 20),
  800: mix(variable, "black", 40),
  900: mix(variable, "black", 60),
  950: mix(variable, "black", 80),
});

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        primary: themeScale("--theme-primary"),
        accent: themeScale("--theme-accent"),
        success: themeScale("--theme-success"),
        warning: themeScale("--theme-warning"),
        error: themeScale("--theme-error"),
        info: themeScale("--theme-info"),
        gray: {
          750: "#2D3748", // Custom gray shade for dark mode hover
        },
        red: {
          950: "#450A0A", // Deep red for dark mode
        },
      },
      borderRadius: {
        lg: "0.5rem",
        md: "0.375rem",
        sm: "0.25rem",
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
      },
    },
  },
  plugins: [require("@tailwindcss/container-queries")],
}
