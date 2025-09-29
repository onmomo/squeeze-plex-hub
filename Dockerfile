ARG NODE_VERSION=lts
ARG APP_VERSION=latest

# Create build stage
FROM node:${NODE_VERSION} AS build

# Enable corepack and set Yarn as the package manager
RUN corepack enable && corepack prepare yarn@stable --activate

# Copy package.json and yarn.lock files to the working directory
COPY ./package.json /app/
COPY ./yarn.lock /app/
# Copy the rest of the application files to the working directory
COPY . ./app/

# Set the working directory inside the container
WORKDIR /app

# Install dependencies
RUN yarn install

# Build the application
RUN yarn build

# Create a new stage for the production image
FROM node:${NODE_VERSION}-slim

# Set the working directory inside the container
WORKDIR /app

# Copy the output from the build stage to the working directory
COPY --from=build /app/.output ./

# Define environment variables
ENV HOST=0.0.0.0 \
    NODE_ENV=production \
    VERSION=${APP_VERSION}

# Expose the port the application will run on
EXPOSE 3000

# Start the application
CMD ["node","/app/server/index.mjs"]
