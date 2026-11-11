import { AuthStandardClientScopes, EnvironmentId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import { render } from "../../../test/render";

const createPairingCredential = vi.hoisted(() => vi.fn());

vi.mock(import("~/state/auth"), async (original) => {
  const actual = await original();
  return {
    ...actual,
    authEnvironment: {
      ...actual.authEnvironment,
      createPairingCredential: createPairingCredential as never,
    },
  };
});
vi.mock(import("~/state/session"), async (original) => ({
  ...(await original()),
  readEnvironmentScope: () => true,
}));
vi.mock(import("~/state/use-atom-command"), async (original) => ({
  ...(await original()),
  useAtomCommand: ((command: unknown) => command) as never,
}));
vi.mock(import("~/hooks/useNowSecond"), () => ({
  useNowSecond: () => Date.parse("2026-11-11T00:00:00.000Z"),
}));

import { FrpTunnelSettings } from "./FrpTunnelSettings";

it("requests a persistent grant when generating the phone pairing QR code", async () => {
  const environmentId = EnvironmentId.make("frp-desktop");
  createPairingCredential.mockReset();
  createPairingCredential.mockResolvedValue({
    _tag: "Success",
    value: {
      id: "phone-link",
      credential: "one-use-only",
      expiresAt: DateTime.makeUnsafe("2026-11-11T00:05:00.000Z"),
    },
  });
  await using screen = await render(
    <FrpTunnelSettings
      bridge={{ setFrpTunnel: vi.fn() }}
      state={{ status: "connected", url: "https://desk.example.test", message: null }}
      readError={null}
      environmentId={environmentId}
      delegatableScopes={AuthStandardClientScopes}
    />,
  );

  await userEvent.click(screen.getByRole("button", { name: "手机扫码配对" }));
  const dialog = screen.getByRole("dialog", { name: "手机扫码配对" });
  await expect.element(dialog.getByRole("img", { name: "FRP 手机配对二维码" })).toBeVisible();
  expect(createPairingCredential).toHaveBeenCalledWith({
    environmentId,
    input: { scopes: AuthStandardClientScopes, persistent: true },
  });
});
