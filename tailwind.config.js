/** @type {import('tailwindcss').Config} */

// Theme colours are CSS variables (space-separated RGB channels, see
// src/styles.css) so the whole UI follows the system light/dark preference
// and opacity modifiers like `text-ink/60` keep working.
const v = name => `rgb(var(--${name}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'media',
  theme: {
    extend: {
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif']
      },
      colors: {
        // Page background
        cream: v('cream'),
        // Foreground text / fills
        ink: v('ink'),
        // Fixed dark tone for modal backdrops — never inverts.
        scrim: '#0F0F12',
        candy: {
          pink: '#FF4FA3',
          yellow: '#FFD93D',
          mint: '#5EE2C1',
          blue: '#4D7CFF',
          coral: '#FF7A59',
          purple: '#9B6DFF'
        }
      },
      // `bg-white` is the raised surface (cards, inputs); `text-white` stays white.
      backgroundColor: {
        white: v('surface')
      },
      // Outlines follow --line so they stay visible on candy fills in dark mode.
      borderColor: {
        ink: v('line')
      },
      ringColor: {
        ink: v('line')
      },
      boxShadow: {
        chunk: '6px 6px 0 0 rgb(var(--shadow))',
        'chunk-sm': '3px 3px 0 0 rgb(var(--shadow))',
        'chunk-lg': '10px 10px 0 0 rgb(var(--shadow))'
      }
    }
  },
  plugins: []
}
