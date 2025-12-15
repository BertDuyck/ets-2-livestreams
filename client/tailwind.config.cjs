/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/**/*.{html,ts}',
  ],
  theme: {
    extend: {
      colors: {
        ets: {
          bg: '#0e0f12',
          panel: '#15171c',
          accent: '#d4a217',
          accent2: '#9c1a1c',
        },
      },
    },
  },
  plugins: [],
};
