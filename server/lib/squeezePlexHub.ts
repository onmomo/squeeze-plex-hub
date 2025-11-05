const { appVersion } = useRuntimeConfig()

export const plexOptions = {
  identifier: 'SqueezePlexHub',
  product: 'Squeeze Plex Hub', // Plexamp, Plex Web,
  version: appVersion,
  device: 'Windows', // $device:$model combination found to be accepted by :/timeline endpoint = Windows:$ANYSTRING, Android:$ANYSTRING iOS:$ANYSTRING
  model: 'Squeezebox Player',
  platform: 'Squeeze Plex Hub', // Linux, Safari
  platformVersion: appVersion,
  deviceClass: 'speaker', // will result in a speaker icon on mobile (also possible values: stb, tablet, mobile, pc)
  protocol: 'plex',
  protocolVersion: '1',
  protocolCapabilities: 'timeline,playback,playqueues,playqueues-creation',
  controllable: 'volume,repeat,skipPrevious,seekTo,stepBack,stepForward,stop,playPause',
  port: '3000' // needs to be aligned with the port the server is bound to
}
