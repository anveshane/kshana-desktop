/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/renderer/vendor/**/*.{js,jsx,ts,tsx}',
    './src/renderer/components/preview/BetaEditorShell/**/*.{js,jsx,ts,tsx}',
  ],
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {},
  },
  plugins: [],
};
