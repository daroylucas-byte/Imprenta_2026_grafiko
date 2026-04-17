/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#4F46E5',
          light: '#EEF2FF',
          dark: '#3730A3'
        },
        success: '#059669',
        warning: '#D97706',
        danger: '#DC2626',
      }
    },
  },
  plugins: [],
}
