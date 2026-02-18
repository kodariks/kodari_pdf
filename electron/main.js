const { app, BrowserWindow, dialog, ipcMain, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Kodari PDF',
    icon: path.join(__dirname, '../public/icon.ico'),
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  buildMenu();
}

function buildMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open PDF...',
          accelerator: 'CmdOrCtrl+O',
          click: () => openPDFDialog(),
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Alt+F4',
          click: () => app.quit(),
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About Kodari PDF',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About Kodari PDF',
              message: 'Kodari PDF Reader',
              detail: `Version: ${app.getVersion()}\nA cross-platform PDF reader.\n\nAlso available at: https://kodari.app`,
            });
          },
        },
        {
          label: 'Open in Browser',
          click: () => shell.openExternal('http://localhost:5173'),
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

async function openPDFDialog() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open PDF File',
    filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
    properties: ['openFile'],
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0];
    const fileData = fs.readFileSync(filePath);
    const base64 = fileData.toString('base64');
    const fileName = path.basename(filePath);
    mainWindow.webContents.send('open-pdf', { base64, fileName, filePath });
  }
}

// IPC Handlers
ipcMain.handle('open-pdf-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open PDF File',
    filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
    properties: ['openFile'],
  });

  if (result.canceled || result.filePaths.length === 0) return null;

  const filePath = result.filePaths[0];
  const fileData = fs.readFileSync(filePath);
  const base64 = fileData.toString('base64');
  const fileName = path.basename(filePath);
  return { base64, fileName, filePath };
});

ipcMain.handle('read-pdf-file', async (_, filePath) => {
  try {
    const fileData = fs.readFileSync(filePath);
    return { base64: fileData.toString('base64'), fileName: path.basename(filePath) };
  } catch {
    return null;
  }
});

ipcMain.handle('get-recent-files', async () => {
  // Return electron's recent documents
  return app.getRecentDocuments ? [] : [];
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Handle file open via OS (e.g. double-clicking a .pdf)
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (mainWindow) {
    const fileData = fs.readFileSync(filePath);
    const base64 = fileData.toString('base64');
    const fileName = path.basename(filePath);
    mainWindow.webContents.send('open-pdf', { base64, fileName, filePath });
  }
});
