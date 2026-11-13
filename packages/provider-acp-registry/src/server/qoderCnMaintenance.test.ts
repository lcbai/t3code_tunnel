import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";

import { readQoderCnInstalledVersion, resolveQoderCnMaintenance } from "./qoderCnMaintenance.ts";

describe("Qoder CN maintenance", () => {
  it.live("updates the installer entry behind a stable alias and reads the official manifest", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const home = yield* fs.makeTempDirectoryScoped();
      const bin = path.join(home, ".qoder-cn", "bin", "qoderclicn");
      const versioned = path.join(bin, "qoderclicn-1.1.88");
      const localBin = path.join(home, ".local", "bin");
      const entry = path.join(localBin, "qoderclicn");
      const command = path.join(home, "qodercn");
      const pinned = path.join(bin, "qodercn");
      yield* fs.makeDirectory(bin, { recursive: true });
      yield* fs.makeDirectory(localBin, { recursive: true });
      yield* fs.writeFileString(versioned, '#!/bin/sh\nprintf "1.1.88\\n"\n');
      yield* fs.chmod(versioned, 0o755);
      yield* fs.symlink(versioned, entry);
      yield* fs.symlink(path.join(".local", "bin", "qoderclicn"), command);
      yield* fs.symlink(versioned, pinned);

      const client = HttpClient.make((request) => {
        expect(request.url).toBe("https://static.qoder.com.cn/qoder-cli-cn/channels/manifest.json");
        return Effect.succeed(
          HttpClientResponse.fromWeb(request, Response.json({ latest: "v1.1.90" })),
        );
      });
      const resolve = (executable: string) =>
        resolveQoderCnMaintenance({ command: executable, args: ["--acp"] }).pipe(
          Effect.provideService(HostProcess.HomeDirectory, home),
          Effect.provideService(HostProcess.Platform, "darwin"),
          Effect.provideService(HttpClient.HttpClient, client),
        );

      const maintenance = yield* resolve(command);
      expect(maintenance.update).toMatchObject({
        executable: entry,
        args: ["update"],
        lockKey: "qoder-cn-native",
      });
      expect(yield* maintenance.lookupLatestVersion!).toBe("1.1.90");
      expect((yield* resolve(pinned)).update).toBeNull();
      expect(yield* readQoderCnInstalledVersion({ command, args: ["--acp"] })).toBe("1.1.88");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
