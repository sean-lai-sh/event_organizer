'use strict';

const { startServer } = require('next/dist/server/lib/start-server');

const args = process.argv.slice(2);

let portValue = process.env.PORT;
let hostname = process.env.HOSTNAME || 'localhost';
let quiet = false;

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];

  if ((arg === '--port' || arg === '-p') && i + 1 < args.length) {
    portValue = args[i + 1];
    i += 1;
    continue;
  }

  if ((arg === '--hostname' || arg === '-H') && i + 1 < args.length) {
    hostname = args[i + 1];
    i += 1;
    continue;
  }

  if (arg === '--quiet') {
    quiet = true;
  }
}

const parsedPort = Number.parseInt(portValue || '3000', 10);
const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 3000;

startServer({
  dir: process.cwd(),
  port,
  isDev: true,
  hostname,
  allowRetry: false,
  minimalMode: false,
  quiet,
  keepAliveTimeout: undefined,
  selfSignedCertificate: undefined,
  experimentalHttpsServer: false,
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
