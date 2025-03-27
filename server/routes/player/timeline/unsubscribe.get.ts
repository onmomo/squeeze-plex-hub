import useLogger from '~/server/composables/useLogger'

const logger = useLogger('timeline.unsubscribe')
const storage = useStorage('DISCOVERY')

export default eventHandler(async (event) => {
  const clientIdentifier = getRequestHeader(event, 'X-Plex-Client-Identifier')
  const targetClientIdentifier = getRequestHeader(event, 'X-Plex-Target-Client-Identifier')

  if (!clientIdentifier || !targetClientIdentifier) {
    logger.warn(
      `Missing required parameters ('X-Plex-Target-Client-Identifier', 'X-Plex-Client-Identifier', 'X-Plex-Device-Name' headers and 'commandID' query parameter), got:`,
      event.node.req.headers
    )
    return event.respondWith(
      new Response(`Missing required parameters ('X-Plex-Client-Identifier' in unsubscribe request`, { status: 400 })
    )
  }

  await storage.removeItem(`subscribers/${targetClientIdentifier}/${clientIdentifier}`)
  sendNoContent(event, 200)
})
