const uimConfig = require("@suiss/uim/tailwind.config")

/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [uimConfig],
  content: ["./app/**/*.{ts,tsx}", "../../packages/uim/src/**/*.{ts,tsx}"],
}
