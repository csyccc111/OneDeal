// OneDeal · PM2 生态文件（可选，与 systemd 二选一）
// 用法：pm2 start ecosystem.config.js && pm2 save && pm2 startup
// 说明：Production 模式下 Next standalone 输出位于 .next/standalone，
//       请先执行 npm run build 并把 .next/static 与 public 拷入 standalone（见 deploy.sh）。
module.exports = {
  apps: [
    {
      name: "onedeal",
      cwd: ".next/standalone",
      script: "server.js",
      instances: 1,
      autorestart: true,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        HOSTNAME: "0.0.0.0",
        PORT: 3000,
      },
      env_file: ".env",
    },
  ],
};
