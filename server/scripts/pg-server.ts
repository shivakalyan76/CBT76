import { PGlite } from "@electric-sql/pglite";
import net from "net";
import path from "path";

const dataDir = path.resolve(__dirname, "../prisma/pgdata");
const db = new PGlite(dataDir);

let pgliteQueue: Promise<void> = Promise.resolve();

function runExclusive<T>(fn: () => Promise<T>): Promise<T> {
  const result = pgliteQueue.then(fn, fn);
  pgliteQueue = result.then(() => {}, () => {});
  return result;
}

const server = net.createServer((socket) => {
  socket.setNoDelay(true);
  let buffer = Buffer.alloc(0);

  socket.on("data", async (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);

    while (buffer.length > 0) {
      // 1. Startup or SSL request packet
      if (buffer.length >= 8) {
        const len = buffer.readInt32BE(0);
        const code = buffer.readInt32BE(4);
        if (code === 196608 || code === 0x00030000 || code === 80877103) {
          if (buffer.length >= len) {
            const msg = buffer.subarray(0, len);
            buffer = buffer.subarray(len);
            await runExclusive(async () => {
              if (socket.writable) {
                await db.execProtocolRawStream(new Uint8Array(msg), {
                  onRawData: (data) => {
                    if (socket.writable) socket.write(Buffer.from(data));
                  },
                });
              }
            });
            continue;
          } else {
            break;
          }
        }
      }

      // 2. Regular message framing (accumulate until terminal message: 'S' Sync, 'Q' Query, 'X' Terminate, 'p' Password, 'H' Flush)
      let offset = 0;
      let hasTerminal = false;
      let completeBatchLen = 0;

      while (offset < buffer.length) {
        if (buffer.length - offset < 5) break;
        const type = buffer[offset];
        const msgLen = buffer.readInt32BE(offset + 1);
        const totalMsgLen = 1 + msgLen;
        if (buffer.length - offset < totalMsgLen) break;

        offset += totalMsgLen;
        // 'S' (0x53 Sync), 'Q' (0x51 Simple Query), 'X' (0x58 Terminate), 'p' (0x70 Password), 'H' (0x48 Flush)
        if (type === 0x53 || type === 0x51 || type === 0x58 || type === 0x70 || type === 0x48) {
          hasTerminal = true;
          completeBatchLen = offset;
          break;
        }
      }

      if (!hasTerminal || completeBatchLen === 0) {
        break;
      }

      const batch = buffer.subarray(0, completeBatchLen);
      buffer = buffer.subarray(completeBatchLen);

      await runExclusive(async () => {
        if (socket.writable) {
          await db.execProtocolRawStream(new Uint8Array(batch), {
            onRawData: (data) => {
              if (socket.writable) socket.write(Buffer.from(data));
            },
          });
        }
      });
    }
  });

  socket.on("error", () => {
    socket.destroy();
  });
});

async function main() {
  await db.waitReady;
  server.listen(5432, "127.0.0.1", () => {
    console.log(`[PGlite] Robust PostgreSQL socket server running on 127.0.0.1:5432 (data: ${dataDir})`);
  });
}

main().catch((err) => {
  console.error("Failed to start pg server:", err);
  process.exit(1);
});
