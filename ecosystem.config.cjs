module.exports = {
  apps: [
    {
      name: "preauth-agent",
      script: "src/index.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      env: { NODE_ENV: "production" },
      max_memory_restart: "300M",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      merge_logs: true,
      out_file: "logs/out.log",
      error_file: "logs/error.log",
    },
  ],
};
