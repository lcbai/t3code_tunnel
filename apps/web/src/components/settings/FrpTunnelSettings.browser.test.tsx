import { type DesktopBridge, EnvironmentId } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";

import "~/index.css";
import { render } from "../../../test/render";
import { FrpTunnelSettings } from "./FrpTunnelSettings";

vi.mock(import("~/state/session"), async (original) => ({
  ...(await original()),
  readEnvironmentScope: () => true,
}));

it("configures a secure FRP origin, clears the token field, and confirms before disconnecting", async () => {
  await page.viewport(1280, 900);
  const url = "https://phone.example.test";
  const setFrpTunnel = vi.fn<DesktopBridge["setFrpTunnel"]>(async () => ({
    status: "connected",
    url,
    message: null,
  }));
  const props = {
    bridge: { setFrpTunnel },
    readError: null,
    environmentId: EnvironmentId.make("frp-desktop"),
  };
  await using screen = await render(
    <FrpTunnelSettings {...props} state={{ status: "disabled", url: null, message: null }} />,
  );
  await screen.getByRole("button", { name: "Configure" }).click();
  const configure = page.getByRole("dialog", { name: "FRP tunnel" });
  const connect = configure.getByRole("button", { name: "Connect", exact: true });
  await configure.getByLabelText("Server URL").fill("http://phone.example.test");
  await configure.getByLabelText("Token").fill("test-token");
  await expect.element(connect).toBeDisabled();
  await configure.getByLabelText("Server URL").fill("phone.example.test");
  await connect.click();
  await expect.element(configure).not.toBeInTheDocument();
  expect(setFrpTunnel).toHaveBeenCalledWith({ url, token: "test-token" });

  await screen.rerender(
    <FrpTunnelSettings {...props} state={{ status: "connected", url, message: null }} />,
  );
  await screen.getByRole("button", { name: "Edit" }).click();
  await expect.element(configure.getByLabelText("Server URL")).toHaveValue(url);
  await expect.element(configure.getByLabelText("Token")).toHaveValue("");
  await configure.getByRole("button", { name: "Cancel" }).click();
  await screen.getByRole("button", { name: "Disconnect", exact: true }).click();
  const disconnect = page.getByRole("alertdialog", { name: "Disconnect the FRP tunnel?" });
  expect(setFrpTunnel).toHaveBeenCalledTimes(1);
  await disconnect.getByRole("button", { name: "Disconnect", exact: true }).click();
  await expect.element(disconnect).not.toBeInTheDocument();
  expect(setFrpTunnel).toHaveBeenLastCalledWith(null);
});
