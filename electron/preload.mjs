import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("qrohl", {
  appName: "Qrohl",
});
