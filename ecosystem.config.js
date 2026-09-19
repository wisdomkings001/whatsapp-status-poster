module.exports = {
  apps: [
    {
      name: 'status-queue',
      script: 'server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '400M',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
