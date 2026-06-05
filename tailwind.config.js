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
        primary: {
          DEFAULT: "rgb(var(--theme-primary-rgb) / <alpha-value>)",
          50: "color-mix(in srgb, var(--theme-primary), white 95%)",
          100: "color-mix(in srgb, var(--theme-primary), white 90%)",
          200: "color-mix(in srgb, var(--theme-primary), white 70%)",
          300: "color-mix(in srgb, var(--theme-primary), white 50%)",
          400: "color-mix(in srgb, var(--theme-primary), white 20%)",
          500: "var(--theme-primary)",
          600: "color-mix(in srgb, var(--theme-primary), black 10%)",
          700: "color-mix(in srgb, var(--theme-primary), black 20%)",
          800: "color-mix(in srgb, var(--theme-primary), black 40%)",
          900: "color-mix(in srgb, var(--theme-primary), black 60%)",
          950: "color-mix(in srgb, var(--theme-primary), black 80%)",
        },
        accent: {
          DEFAULT: "rgb(var(--theme-accent-rgb) / <alpha-value>)",
          50: "color-mix(in srgb, var(--theme-accent), white 95%)",
          100: "color-mix(in srgb, var(--theme-accent), white 90%)",
          200: "color-mix(in srgb, var(--theme-accent), white 70%)",
          300: "color-mix(in srgb, var(--theme-accent), white 50%)",
          400: "color-mix(in srgb, var(--theme-accent), white 20%)",
          500: "var(--theme-accent)",
          600: "color-mix(in srgb, var(--theme-accent), black 10%)",
          700: "color-mix(in srgb, var(--theme-accent), black 20%)",
          800: "color-mix(in srgb, var(--theme-accent), black 40%)",
          900: "color-mix(in srgb, var(--theme-accent), black 60%)",
          950: "color-mix(in srgb, var(--theme-accent), black 80%)",
        },
        success: {
          DEFAULT: "rgb(var(--theme-success-rgb) / <alpha-value>)",
          50: "color-mix(in srgb, var(--theme-success), white 95%)",
          100: "color-mix(in srgb, var(--theme-success), white 90%)",
          500: "var(--theme-success)",
          600: "color-mix(in srgb, var(--theme-success), black 10%)",
          700: "color-mix(in srgb, var(--theme-success), black 20%)",
        },
        warning: {
          DEFAULT: "rgb(var(--theme-warning-rgb) / <alpha-value>)",
          50: "color-mix(in srgb, var(--theme-warning), white 95%)",
          100: "color-mix(in srgb, var(--theme-warning), white 90%)",
          500: "var(--theme-warning)",
          600: "color-mix(in srgb, var(--theme-warning), black 10%)",
          700: "color-mix(in srgb, var(--theme-warning), black 20%)",
        },
        error: {
          DEFAULT: "rgb(var(--theme-error-rgb) / <alpha-value>)",
          50: "color-mix(in srgb, var(--theme-error), white 95%)",
          100: "color-mix(in srgb, var(--theme-error), white 90%)",
          500: "var(--theme-error)",
          600: "color-mix(in srgb, var(--theme-error), black 10%)",
          700: "color-mix(in srgb, var(--theme-error), black 20%)",
        },
        info: {
          DEFAULT: "rgb(var(--theme-info-rgb) / <alpha-value>)",
          50: "color-mix(in srgb, var(--theme-info), white 95%)",
          100: "color-mix(in srgb, var(--theme-info), white 90%)",
          500: "var(--theme-info)",
          600: "color-mix(in srgb, var(--theme-info), black 10%)",
          700: "color-mix(in srgb, var(--theme-info), black 20%)",
        },
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
