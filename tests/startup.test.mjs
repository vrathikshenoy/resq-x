import { test } from "node:test";
import assert from "node:assert/strict";
import { Server } from "node:http";
import { fileURLToPath } from "node:url";

test("backend entry point reaches listen without an import deadlock", async () => {
  process.env.DATABASE_PATH = ":memory:";
  process.env.PORT = "3001";
  process.env.HOST = "127.0.0.1";
  const previousEntry = process.argv[1], previousListen = Server.prototype.listen;
  let reachedListen = false;
  // Stub only socket binding; evaluate the actual startup module and feature imports.
  Server.prototype.listen = function (port, host, callback) {
    assert.equal(port, 3001);
    assert.equal(host, "127.0.0.1");
    assert.equal(this.listenerCount("request"), 1);
    reachedListen = true;
    callback();
    return this;
  };
  try {
    process.argv[1] = fileURLToPath(new URL("../backend/server.mjs", import.meta.url));
    await import("../backend/server.mjs");
    assert.equal(reachedListen, true);
  } finally {
    process.argv[1] = previousEntry;
    Server.prototype.listen = previousListen;
  }
});
