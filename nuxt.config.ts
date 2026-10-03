export default {
  runtimeConfig: {
    logLevel: 'info',
    appVersion: process.env.APP_VERSION || 'latest',
    // Serve fake LMS servers and players without network discovery, enable with NUXT_DEMO=true
    demo: false,
    // Demo mode only: 'host:port' of a Lyrion Music Server to load the real player model images from, e.g. NUXT_DEMO_LMS=localhost:9000
    demoLms: ''
  },
  devServer: {
    host: '0.0.0.0' // required to allow plex server and players to connect and poll from squeeze plex hub players'    
  },
  vite: {
    middleware: {
      '/': '~/server/middleware/catchAll.ts'
    },
    server: {
      allowedHosts: [
        'localhost',
        '.plex.direct' // allow request from app.plex.tv web player
      ]
    }
  },
  compatibilityDate: '2025-01-25',
  devtools: {
    enabled: process.env.NODE_ENV !== 'production'
  },
  target: 'server',
  app: {
    head: {
      title: 'Squeeze Plex Hub',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        {
          hid: 'description',
          name: 'description',
          content:
            'Squeeze Plex Hub bridges Plexamp (Plex) with your Logitech / Lyron Media Server ecosystem so you can play Plex audio on Squeezebox (and compatible) players.'
        }
      ],
      link: [
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
        { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16x16.png' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
        { rel: 'manifest', href: '/site.webmanifest' }
      ]
    }
  },
  css: ['~/assets/css/main.css'],
  plugins: [],
  components: true,
  typescript: {
    typeCheck: true,
    strict: true
  },
  buildModules: ['@nuxt/typescript-build'],
  modules: ['@nuxt/ui'],
  colorMode: {
    preference: 'dark'
  },
  icon: {
    // The hub runs offline on the LAN: bundle icons instead of fetching them from the Iconify API
    serverBundle: { collections: ['lucide'] },
    clientBundle: {
      scan: true,
      // Icons chosen at runtime (color mode button, toasts) are not found by the scan
      icons: ['lucide:sun', 'lucide:moon', 'lucide:eye-off', 'lucide:radio', 'lucide:triangle-alert', 'lucide:copy', 'lucide:x']
    }
  },
  fonts: {
    providers: {
      google: false,
      googleicons: false,
      bunny: false,
      fontsource: false,
      fontshare: false
    }
  },
  nitro: {
    scheduledTasks: {
      '* * * * *': ['gdmDiscovery', 'squeezePlayersScanner'], // run every minute
    },
    experimental: {
      tasks: true
    }
  }
}
