# Squeeze Plex Hub

[![codecov](https://codecov.io/gh/onmomo/squeeze-plex-hub/graph/badge.svg?token=YKSKRGA15P)](https://codecov.io/gh/onmomo/squeeze-plex-hub)

A Squeeze Plex Hub that allows you to play your Plex content on your Squeezebox devices.

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

## Usage

- Navigate to `http://localhost:3000` to access the application.
- The application will display all discovered Squeezebox players and Logitech / Lyron Media Servers (LMS), along with their metadata.
- Use the interface to verify which Squeezebox players can be controlled via Plexamp and start to play your audio content on the discovered devices.


## License

This project is licensed under the MIT License.