import type { PlexTrack } from "../routes/player/playback/playMedia.get";

export interface PlexServer {
  protocol: string
  host: string
  port: string
  token: string
}

// TODO we should never use the public plex address since we need to send the plex token as url query parameter for LMS to stream from it. I can't think of a valid where using the public plex address would be useful in our LMS use case
export function getPlexApiUrl(protocol: string, address: string, port: string, path: string): string {
  return `${protocol}://${address}:${port}${path}`;
}

export function getPlexApiTrackUrl(protocol: string, address: string, port: string, track: PlexTrack, token: string): string {
  return `${protocol}://${address}:${port}${track.file}?X-Plex-Token=${token}`
  //TODO return `${protocol}://${address}:${port}${track.file}?X-Plex-Token=${token}&artist=mytitle&title=blubber&cover=https%3A%2F%2Fwww.rockarchive.com%2Fmedia%2F1890%2Fdavid-bowie-db001duffy.jpg%3Fcrop%3D0.19186424300418511%2C0.18786141133986681%2C0.20427102269629802%2C0.20827385436061632%26cropmode%3Dpercentage%26width%3D800%26height%3D800%26rnd%3D132951122240000000%26overlay%3Dwatermark.png%26overlay.size%3D230%2C20%26overlay.position%3D0%2C780`
}