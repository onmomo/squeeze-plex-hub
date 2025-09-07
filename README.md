![Squeeze Plex Hub Logo](public/logo_512.png)

# Squeeze Plex Hub

[![codecov](https://codecov.io/gh/onmomo/squeeze-plex-hub/graph/badge.svg?token=YKSKRGA15P)](https://codecov.io/gh/onmomo/squeeze-plex-hub)

Squeeze Plex Hub bridges Plexamp (Plex) with your Logitech / Lyron Media Server ecosystem so you can play Plex audio on Squeezebox (and compatible) players.

## Features
* Discovers LMS instances and attached Squeeze players automatically
* Advertises discovered Squeeze players to Plexamp so they appear as selectable targets with full Plexamp controls
* Shows player and server metadata
* Simple Docker-based deployment

## Requirements
* Running Logitech / Lyron Media Server (LMS) with at least one connected player
   * LMS JSON/CLI interfaces enabled (default)
* Plex Media Server with your audio library
* Plexamp client (desktop or mobile) signed into the same Plex account
* Network: Squeeze Plex Hub must reach both LMS and Plexamp client (usually same LAN)

## Run Squeeze Plex Hub
You can:
1. Use the provided Docker image (see command below).
2. Or build locally (yarn install && yarn dev) for development.

After start:
1. Open http://localhost:3000
2. Confirm LMS and players are listed
3. Use Plexamp to target compatible players
No Plex credentials are ever stored. The app discovers LMS and Plex services on your local network only, and when initiating playback it forwards the Plex token so the Squeezebox player can stream directly from your Plex Media Server. The token is not persisted and expires after some time.

## Troubleshooting
* Player not listed:
   * Verify the player appears and is connected in LMS first.
   * Check Squeeze Plex Hub (http://localhost:3000) and confirm both LMS and players are shown.
   * If shown in the Hub but missing in Plexamp, restart Plexamp app to trigger device re-discovery.
   * If missing in the Hub, check logs: docker logs squeeze-plex-hub (look for discovery or network errors).
   * Ensure the container can reach LMS and Plex Media Server (same subnet, no firewall blocking UDP ports 32412, 32414) and LMS CLI is enabled.
* Resume fails with 401: the Plex token expired. Reload the playlist in Plexamp for the Squeeze player to refresh it.
* Port conflict: If 3000 is already in use, publish a different host port (e.g. docker run -p 8080:3000 ...) and browse to http://localhost:8080.
* Album artwork not showing on the Squeezebox display: Current LMS limitation; reading artwork from direct stream isn’t supported for Plex audio streams.

```
docker run -d -p 3000:3000 --name squeeze-plex-hub onmomo/squeeze-plex-hub
```

- Navigate to `http://localhost:3000` to access the Squeeze Plex Hub web interface.
- The application will display all discovered Squeezebox players and Logitech / Lyron Media Servers (LMS), along with their metadata.
- Use the interface to verify which Squeezebox players can be controlled via Plexamp and start to play your audio content on the discovered devices.


## Project Structure

```
squeeze-plex-hub
├── components      # Vue components for application pages
│   └── DiscoveredDevices.vue
├── pages           # Application pages
│   └── index.vue   # Main page of the application
├── public          # Static files served directly
├── server          # Backend logic and API routes
├── nuxt.config.ts  # Nuxt configuration file
├── tsconfig.json   # TypeScript configuration file
├── package.json    # npm configuration file
└── README.md       # Project documentation
```

## Dev Setup Instructions

1. Clone the repository:
   ```
   git clone https://github.com/onmomo/squeeze-plex-hub.git
   ```

2. Navigate to the project directory:
   ```
   cd squeeze-plex-hub
   ```

3. Install dependencies using Yarn:
   ```
   yarn install
   ```

4. Run the development server:
   ```
   yarn dev
   ```

## Container Run Instructions

To run the application in a container using Docker:

1. Build the Docker image:
   ```
   docker build -t squeeze-plex-hub .
   ```

2. Run the container:
   ```
   docker run -p 3000:3000 squeeze-plex-hub
   ```

The application will be available at `http://localhost:3000`.

## License

This project is licensed under the MIT License.