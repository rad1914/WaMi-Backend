// ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: 'wngd1',
      script: './app.js',
      cwd: '/mnt/sdk/wngd1',
      interpreter: '/root/.local/share/fnm/node-versions/v20.19.2/installation/bin/node',
    },
  ],
};
