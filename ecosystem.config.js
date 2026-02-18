module.exports = {
  apps: [
    {
      name: "ra-h",
      script: "node_modules/.bin/next",
      args: "start",
      cwd: __dirname,
      env: {
        NEXT_PUBLIC_DEPLOYMENT_MODE: "local",
        NEXT_PUBLIC_ENABLE_SUBSCRIPTION_BACKEND: "false",
        NODE_OPTIONS: "--dns-result-order=ipv4first",
        NODE_ENV: "production",
      },
    },
    {
      name: "ra-h-mcp",
      script: "scripts/dev/run-mcp-server.sh",
      interpreter: "bash",
      cwd: __dirname,
    },
    {
      name: "ra-h-karakeep",
      script: "scripts/sync/karakeep-sync.js",
      interpreter: "node",
      cwd: __dirname,
      cron_restart: "* * * * *",
      autorestart: false,
    },
  ],
};
