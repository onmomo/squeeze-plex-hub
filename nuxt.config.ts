export default {
  runtimeConfig: {
    logLevel: 'debug',
  },
  compatibilityDate: '2025-01-25',
  devtools: {
    enabled: true
  },
  target: 'server',
  head: {
    title: 'Squeeze Plex Hub',
    meta: [
      { charset: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { hid: 'description', name: 'description', content: 'Squeeze Plex Hub' }
    ],
    link: [
      { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' }
    ]
  },
  //css: ['vuetify/lib/styles/main.sass', '@mdi/font/css/materialdesignicons.min.css'],
  //css: ['vuetify/lib/styles/main.sass'],
  plugins: [],
  components: true,
  typescript: {
    typeCheck: true,
    strict: true,
  },
  buildModules: [
    '@nuxt/typescript-build'
  ],
  modules: ['nuxt-scheduler', '@nuxt/ui']
}