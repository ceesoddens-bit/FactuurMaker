const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

// Settings file path in UserData
const settingsPath = path.join(app.getPath('userData'), 'factuur_maker_settings.json');

function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    }
  } catch (err) {
    console.error('Fout bij het laden van instellingen:', err);
  }
  return { invoicesFolder: '', receiptsFolder: '' };
}

function saveSettings(settings) {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
  } catch (err) {
    console.error('Fout bij het opslaan van instellingen:', err);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1300,
    height: 880,
    minWidth: 950,
    minHeight: 650,
    title: 'Cees AI Studio - FactuurMaker',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 14 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC Handlers
ipcMain.handle('get-folders', () => {
  return loadSettings();
});

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Selecteer Google Drive map'
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

ipcMain.handle('save-folder-setting', async (event, { key, path: folderPath }) => {
  const settings = loadSettings();
  settings[key] = folderPath;
  saveSettings(settings);
  return settings;
});

ipcMain.handle('save-pdf-file', async (event, { filename, base64Data, targetFolder }) => {
  try {
    const settings = loadSettings();
    let folder = targetFolder || settings.invoicesFolder;

    if (!folder || !fs.existsSync(folder)) {
      // Prompt user for folder if not configured
      const dialogResult = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory', 'createDirectory'],
        title: 'Selecteer map voor opslaan facturen/offertes'
      });
      if (dialogResult.canceled || !dialogResult.filePaths.length) {
        return { success: false, message: 'Geen map geselecteerd.' };
      }
      folder = dialogResult.filePaths[0];
      settings.invoicesFolder = folder;
      saveSettings(settings);
    }

    const targetPath = path.join(folder, filename);
    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(targetPath, buffer);
    return { success: true, path: targetPath };
  } catch (err) {
    console.error('Fout bij opslaan PDF:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('save-receipt-file', async (event, { filename, base64Data, targetFolder }) => {
  try {
    const settings = loadSettings();
    let folder = targetFolder || settings.receiptsFolder;

    if (!folder || !fs.existsSync(folder)) {
      const dialogResult = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory', 'createDirectory'],
        title: 'Selecteer map voor opslaan bonnetjes'
      });
      if (dialogResult.canceled || !dialogResult.filePaths.length) {
        return { success: false, message: 'Geen map geselecteerd.' };
      }
      folder = dialogResult.filePaths[0];
      settings.receiptsFolder = folder;
      saveSettings(settings);
    }

    const targetPath = path.join(folder, filename);
    const buffer = Buffer.from(base64Data.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    fs.writeFileSync(targetPath, buffer);
    return { success: true, path: targetPath };
  } catch (err) {
    console.error('Fout bij opslaan bonnetje:', err);
    return { success: false, error: err.message };
  }
});
