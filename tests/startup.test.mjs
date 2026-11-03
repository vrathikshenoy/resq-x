import { test } from "node:test";
import assert from "node:assert/strict";
import { Server } from "node:http";
import { fileURLToPath } from "node:url";

test("backend entry point reaches listen without an import deadlock", async () => {
  process.env.DATABASE_PATH = ":memory:";
  process.env.PORT = "3001";
  process.env.HOST = "127.0.0.1";
  const previousEntry = process.argv[1],
    previousListen = Server.prototype.listen;
  let reachedListen = false;
  let server;
  // Stub only socket binding; evaluate the actual startup module and feature imports.
  Server.prototype.listen = function (port, host, callback) {
    assert.equal(port, 3001);
    assert.equal(host, "127.0.0.1");
    assert.equal(this.listenerCount("request"), 1);
    server = this;
    reachedListen = true;
    callback();
    return this;
  };
  try {
    process.argv[1] = fileURLToPath(
      new URL("../backend/server.mjs", import.meta.url),
    );
    await import("../backend/server.mjs");
    assert.equal(reachedListen, true);
    const previousError = console.error,
      previousExitCode = process.exitCode;
    let message = "";
    try {
      console.error = (value) => {
        message = value;
      };
      server.emit(
        "error",
        Object.assign(new Error("address in use"), { code: "EADDRINUSE" }),
      );
      assert.equal(process.exitCode, 1);
      assert.match(message, /port 3001 is already in use/);
      assert.match(message, /npm run dev/);
    } finally {
      console.error = previousError;
      process.exitCode = previousExitCode;
    }
  } finally {
    process.argv[1] = previousEntry;
    Server.prototype.listen = previousListen;
  }
});

test("development startup passes its allocated API port to Vite", async () => {
  const childProcess = await import("node:child_process");
  const { syncBuiltinESMExports } = await import("node:module");
  const { EventEmitter } = await import("node:events");
  const previousSpawn = childProcess.default.spawn;
  const previousListen = Server.prototype.listen;
  const previousAddress = Server.prototype.address;
  const originalSignals = new Map(
    ["SIGINT", "SIGTERM"].map((s) => [s, process.listeners(s)]),
  );
  let spawned = false;
  childProcess.default.spawn = (executable, args, options) => {
    assert.equal(executable, process.execPath);
    assert.equal(args[0], "node_modules/vite/bin/vite.js");
    assert.equal(options.env.RESQX_API_TARGET, "http://127.0.0.1:43219");
    spawned = true;
    return Object.assign(new EventEmitter(), { kill() {} });
  };
  syncBuiltinESMExports();
  Server.prototype.address = () => ({ port: 43219 });
  Server.prototype.listen = function (port, host, callback) {
    assert.equal(port, 0);
    assert.equal(host, "127.0.0.1");
    callback();
    return this;
  };
  try {
    await import("../scripts/dev.mjs");
    assert.equal(spawned, true);
  } finally {
    childProcess.default.spawn = previousSpawn;
    syncBuiltinESMExports();
    Server.prototype.listen = previousListen;
    Server.prototype.address = previousAddress;
    for (const [signal, previous] of originalSignals)
      for (const listener of process.listeners(signal))
        if (!previous.includes(listener))
          process.removeListener(signal, listener);
  }
});
