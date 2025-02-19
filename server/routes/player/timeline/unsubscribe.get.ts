import useLogger from '~/server/composables/useLogger'

const logger = useLogger('timeline.unsubscribe.get')
const storage = useStorage('DISCOVERY')

export default eventHandler(async (event) => {
  const clientIdentifier = getRequestHeader(event, 'X-Plex-Client-Identifier')
  const targetClientIdentifier = getRequestHeader(event, 'X-Plex-Target-Client-Identifier')

  if (!clientIdentifier || !targetClientIdentifier) {  
    return event.respondWith(
      new Response(
        `Missing required parameters ('X-Plex-Client-Identifier' in unsubscribe request`,
        { status: 400 }
      )
    )
  }

  await storage.removeItem(`subscribers/${targetClientIdentifier}/${clientIdentifier}`)
  sendNoContent(event, 200)
})
