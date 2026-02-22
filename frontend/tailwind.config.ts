import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        pitch: '#0b1f14',
        grass: '#0f6b3b',
        lime: '#c2ff4a',
        clay: '#f5e6c8',
        ink: '#0c0c0c',
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        body: ['"Work Sans"', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 40px rgba(194, 255, 74, 0.25)',
      },
    },
  },
  plugins: [],
};

export default config;
