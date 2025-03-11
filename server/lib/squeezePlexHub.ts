export const plexOptions = {
    identifier: 'SqueezePlexHub',
    product: 'Squeeze Plex Hub', // Plexamp, Plex Web, 
    version: '1.0',
    device: 'Windows', // $device:$model combination found to be accepted by controller = Windows:$ANYSTRING, Android:$ANYSTRING iOS:$ANYSTRING
    model: 'Squeezebox Player',
    platform: 'Squeeze Plex Hub', // Linux, Safari
    platformVersion: '1.0',
    deviceClass: 'speaker', // will result in a speaker icon on mobile (also possible values: stb, tablet, mobile, pc)
    protocol: 'plex',
    protocolVersion: '1',
    protocolCapabilities: 'timeline,playback,playqueues,playqueues-creation',
    port: '3000' // needs to be aligned with the port the server is bound to    
  }