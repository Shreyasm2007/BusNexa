module.exports = {
  apps: [
    {
      name: "nightroute-api",
      script: "index.js",
      cwd: __dirname + "/server",
      instances: 1,
      autorestart: true,
      watch: false,
      max_restarts: 20,
      restart_delay: 3000,
      env: { NODE_ENV: "production", PORT: 5000 }
    },
    {
      name: "nightroute-web",
      script: "node_modules/vite/bin/vite.js",
      cwd: __dirname + "/client",
      args: "--host 127.0.0.1",
      interpreter: process.execPath,
      instances: 1,
      autorestart: true,
      watch: false,
      max_restarts: 20,
      restart_delay: 3000
    }
  ]
};
