import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Tailwind v4 passe par son plugin Vite, pas par le plugin PostCSS `tailwindcss`.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // L'API est servie sur le meme domaine que le front : les cookies
      // d'authentification restent en « same-origin », sans CORS a gerer
      // ni SameSite=None a relacher.
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
})
