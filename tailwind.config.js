/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif']
      },
      colors: {
        cream: '#FFF8EC',
        ink: '#0F0F12',
        candy: {
          pink: '#FF4FA3',
          yellow: '#FFD93D',
          mint: '#5EE2C1',
          blue: '#4D7CFF',
          coral: '#FF7A59',
          purple: '#9B6DFF'
        }
      },
      boxShadow: {
        chunk: '6px 6px 0 0 #0F0F12',
        'chunk-sm': '3px 3px 0 0 #0F0F12',
        'chunk-lg': '10px 10px 0 0 #0F0F12'
      }
    }
  },
  plugins: []
}
