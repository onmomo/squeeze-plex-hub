# Squeeze Plex Hub

A Squeeze Plex Hub that allows you to play your Plex content on your Squeezebox devices.

## Project Structure

```
squeeze-plex-hub
├── components      # Vue components
│   └── DiscoveredDevices.vue
├── layouts         # Default layout for the application
│   └── default.vue
├── middleware      # Custom middleware functions
├── pages           # Application pages
│   └── index.vue   # Main page of the application
├── plugins         # JavaScript or TypeScript plugins
├── public          # Static files served directly
├── server          # Backend logic and API routes
├── nuxt.config.ts  # Nuxt configuration file
├── tsconfig.json   # TypeScript configuration file
├── package.json    # npm configuration file
└── README.md       # Project documentation
```

## Setup Instructions

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

## Usage

- Navigate to `http://localhost:3000` to access the application.

- The application will display all discovered Squeezebox players and Logitech / Lyron Media Servers (LMS), along with their metadata.
- Use the interface to verify which Squeezebox players can be controlled via Plexamp and play your audio content on the available devices.


## License

This project is licensed under the MIT License.