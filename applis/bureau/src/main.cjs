// Application de bureau Dani Mak (Windows / macOS) : une fenêtre qui ouvre la plateforme en ligne.
// Les données restent sur le serveur ; la session (cookies) et le cache hors ligne du site
// (service worker) sont conservés entre deux lancements.
const { app, BrowserWindow, Menu, shell, ipcMain } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const APP_URL = (process.env.DANIMAK_URL || "https://restaurant-management-saas-platform.vercel.app").replace(/\/$/, "");
const ORIGIN = new URL(APP_URL).origin;
const ETAT = () => path.join(app.getPath("userData"), "fenetre.json");

let fenetre = null;

if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", () => {
  if (!fenetre) return;
  if (fenetre.isMinimized()) fenetre.restore();
  fenetre.focus();
});

function lireEtat() {
  try {
    return JSON.parse(fs.readFileSync(ETAT(), "utf8"));
  } catch {
    return { width: 1280, height: 820 };
  }
}

function sauverEtat() {
  if (!fenetre || fenetre.isDestroyed()) return;
  const etat = { ...fenetre.getNormalBounds(), maximized: fenetre.isMaximized() };
  try {
    fs.writeFileSync(ETAT(), JSON.stringify(etat));
  } catch {}
}

const interne = (url) => {
  try {
    return new URL(url).origin === ORIGIN;
  } catch {
    return false;
  }
};

// Liens internes ouverts dans l'application (reçus à imprimer…), le reste dans le navigateur.
function reglerLiens(contenu) {
  contenu.setWindowOpenHandler(({ url }) => {
    if (interne(url)) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: { width: 520, height: 760, autoHideMenuBar: true, title: "Dani Mak" },
      };
    }
    if (/^https?:|^mailto:|^tel:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  contenu.on("will-navigate", (e, url) => {
    if (!interne(url) && !url.startsWith("file:")) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });
}

function pageHorsLigne() {
  fenetre.loadFile(path.join(__dirname, "hors-ligne.html"));
}

function creerFenetre() {
  const etat = lireEtat();
  fenetre = new BrowserWindow({
    x: etat.x,
    y: etat.y,
    width: etat.width,
    height: etat.height,
    minWidth: 380,
    minHeight: 560,
    title: "Dani Mak",
    backgroundColor: "#faf6e9",
    show: false,
    icon: path.join(__dirname, "..", "assets", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      spellcheck: false,
    },
  });
  if (etat.maximized) fenetre.maximize();
  fenetre.once("ready-to-show", () => fenetre.show());
  for (const ev of ["resize", "move", "close"]) fenetre.on(ev, sauverEtat);
  fenetre.on("closed", () => (fenetre = null));

  // Le site garde un mode hors ligne (service worker) : la page d'erreur ne s'affiche
  // que si rien n'a pu être chargé, même depuis le cache.
  fenetre.webContents.on("did-fail-load", (_e, code, _desc, url, principal) => {
    if (principal && code !== -3 && interne(url)) pageHorsLigne();
  });

  fenetre.loadURL(`${APP_URL}/dashboard`);
}

app.on("web-contents-created", (_e, contenu) => reglerLiens(contenu));
ipcMain.on("reessayer", () => fenetre && fenetre.loadURL(`${APP_URL}/dashboard`));

function menu() {
  const mac = process.platform === "darwin";
  const modele = [
    ...(mac
      ? [{
          label: "Dani Mak",
          submenu: [
            { role: "about", label: "À propos de Dani Mak" },
            { type: "separator" },
            { role: "hide", label: "Masquer Dani Mak" },
            { role: "hideOthers", label: "Masquer les autres" },
            { type: "separator" },
            { role: "quit", label: "Quitter Dani Mak" },
          ],
        }]
      : []),
    {
      label: "Fichier",
      submenu: [
        { label: "Tableau de bord", accelerator: "CmdOrCtrl+Shift+H", click: () => fenetre && fenetre.loadURL(`${APP_URL}/dashboard`) },
        { label: "Imprimer…", accelerator: "CmdOrCtrl+P", click: (_m, w) => w && w.webContents.print() },
        { type: "separator" },
        mac ? { role: "close", label: "Fermer la fenêtre" } : { role: "quit", label: "Quitter" },
      ],
    },
    {
      label: "Édition",
      submenu: [
        { role: "undo", label: "Annuler" },
        { role: "redo", label: "Rétablir" },
        { type: "separator" },
        { role: "cut", label: "Couper" },
        { role: "copy", label: "Copier" },
        { role: "paste", label: "Coller" },
        { role: "selectAll", label: "Tout sélectionner" },
      ],
    },
    {
      label: "Affichage",
      submenu: [
        { label: "Précédent", accelerator: mac ? "Cmd+[" : "Alt+Left", click: (_m, w) => w && w.webContents.navigationHistory.goBack() },
        { label: "Suivant", accelerator: mac ? "Cmd+]" : "Alt+Right", click: (_m, w) => w && w.webContents.navigationHistory.goForward() },
        { role: "reload", label: "Actualiser" },
        { type: "separator" },
        { role: "resetZoom", label: "Taille réelle" },
        { role: "zoomIn", label: "Agrandir" },
        { role: "zoomOut", label: "Réduire" },
        { type: "separator" },
        { role: "togglefullscreen", label: "Plein écran" },
      ],
    },
    {
      label: "Aide",
      submenu: [
        { label: "Guide d'utilisation", click: () => fenetre && fenetre.loadURL(`${APP_URL}/guide`) },
        { label: "Ouvrir dans le navigateur", click: () => shell.openExternal(APP_URL) },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(modele));
}

app.setAboutPanelOptions({
  applicationName: "Dani Mak",
  applicationVersion: app.getVersion(),
  copyright: "Gestion de maquis, restaurants, bars et fast-foods",
});

app.whenReady().then(() => {
  menu();
  creerFenetre();
  app.on("activate", () => {
    if (!BrowserWindow.getAllWindows().length) creerFenetre();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
