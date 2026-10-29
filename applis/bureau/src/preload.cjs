// Seul pont vers l'application : le bouton « Réessayer » de la page hors ligne.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("daniMak", {
  bureau: true,
  reessayer: () => ipcRenderer.send("reessayer"),
});
