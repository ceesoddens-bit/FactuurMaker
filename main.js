const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
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
  return {
    rootDriveFolder: '',
    verkoopfacturenFolder: '',
    offertesFolder: '',
    inkoopZakelijkFolder: '',
    inkoopPriveFolder: '',
    autoQuarter: true
  };
}

function saveSettings(settings) {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
  } catch (err) {
    console.error('Fout bij het opslaan van instellingen:', err);
  }
}

function getQuarterString(dateStr) {
  const date = dateStr ? new Date(`${dateStr}T12:00:00`) : new Date();
  if (isNaN(date.getTime())) return 'Q' + (Math.floor(new Date().getMonth() / 3) + 1);
  const month = date.getMonth(); // 0-11
  return 'Q' + (Math.floor(month / 3) + 1);
}

function resolveTargetDirectory({ baseFolder, date, docType, subType }) {
  const settings = loadSettings();
  let targetDir = baseFolder;

  // Primary fallback if specific folder not set or doesn't exist: use rootDriveFolder
  if ((!targetDir || !fs.existsSync(targetDir)) && settings.rootDriveFolder) {
    targetDir = settings.rootDriveFolder;
  }

  if (!targetDir) return '';

  const lowerDir = targetDir.toLowerCase();
  const quarter = getQuarterString(date);

  const docSubfolderMap = {
    factuur: 'verkoopfacturen',
    offerte: 'offertes',
    inkoop: subType === 'prive' ? 'inkoopfacturen/prive' : 'inkoopfacturen/zakelijk'
  };
  const expectedSubfolder = docSubfolderMap[docType || 'factuur'];
  const mainSubfolder = expectedSubfolder.split('/')[0];

  const hasQuarter = /\/q[1-4](\/|$)/i.test(targetDir);
  const hasDocFolder = lowerDir.includes(mainSubfolder.toLowerCase());

  // If the path ALREADY has both quarter and document subfolder, do not nest further
  if (hasQuarter && hasDocFolder) {
    return targetDir;
  }

  let result = targetDir;
  if (settings.autoQuarter && !hasQuarter) {
    result = path.join(result, quarter);
  }

  if (!hasDocFolder) {
    if (docType === 'inkoop') {
      const typeSub = subType === 'prive' ? 'prive' : 'zakelijk';
      if (!lowerDir.includes('inkoopfacturen')) {
        result = path.join(result, 'inkoopfacturen', typeSub);
      } else if (!lowerDir.includes(typeSub)) {
        result = path.join(result, typeSub);
      }
    } else {
      result = path.join(result, expectedSubfolder);
    }
  }

  return result;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1300,
    height: 880,
    minWidth: 950,
    minHeight: 650,
    title: 'Cees AI Studio - Bedrijfssoftware',
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

ipcMain.handle('save-folder-setting', async (event, { key, path: folderPath, value }) => {
  const settings = loadSettings();
  if (key) {
    settings[key] = folderPath !== undefined ? folderPath : value;
  }
  saveSettings(settings);
  return settings;
});

ipcMain.handle('save-pdf-file', async (event, { filename, base64Data, docType, date }) => {
  try {
    const settings = loadSettings();
    let configuredFolder = docType === 'offerte' ? settings.offertesFolder : settings.verkoopfacturenFolder;
    if (!configuredFolder && settings.invoicesFolder) configuredFolder = settings.invoicesFolder;

    let folder = resolveTargetDirectory({
      baseFolder: configuredFolder,
      date,
      docType: docType || 'factuur'
    });

    let targetPath = null;

    if (folder) {
      try {
        if (!fs.existsSync(folder)) {
          fs.mkdirSync(folder, { recursive: true });
        }
        targetPath = path.join(folder, filename);
      } catch (err) {
        console.warn('Kon doelmap niet aanmaken, fallback naar bewaardialog:', err);
        targetPath = null;
      }
    }

    if (!targetPath) {
      const defaultDir = app.getPath('downloads');
      const dialogResult = await dialog.showSaveDialog(mainWindow, {
        title: `PDF Opslaan - ${docType === 'offerte' ? 'Offerte' : 'Factuur'}`,
        defaultPath: path.join(defaultDir, filename),
        filters: [{ name: 'PDF Bestanden', extensions: ['pdf'] }]
      });
      if (dialogResult.canceled || !dialogResult.filePath) {
        return { success: false, message: 'Opslaan geannuleerd.' };
      }
      targetPath = dialogResult.filePath;
    }

    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(targetPath, buffer);
    return { success: true, path: targetPath };
  } catch (err) {
    console.error('Fout bij opslaan PDF:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('save-receipt-file', async (event, { filename, base64Data, date, subType }) => {
  try {
    const settings = loadSettings();
    const isPrive = subType === 'prive';
    let configuredFolder = isPrive ? settings.inkoopPriveFolder : settings.inkoopZakelijkFolder;
    if (!configuredFolder && settings.receiptsFolder) configuredFolder = settings.receiptsFolder;

    let folder = resolveTargetDirectory({
      baseFolder: configuredFolder,
      date,
      docType: 'inkoop',
      subType: isPrive ? 'prive' : 'zakelijk'
    });

    let targetPath = null;

    if (folder) {
      try {
        if (!fs.existsSync(folder)) {
          fs.mkdirSync(folder, { recursive: true });
        }
        targetPath = path.join(folder, filename);
      } catch (err) {
        console.warn('Kon doelmap niet aanmaken, fallback naar bewaardialog:', err);
        targetPath = null;
      }
    }

    if (!targetPath) {
      const defaultDir = app.getPath('downloads');
      const dialogResult = await dialog.showSaveDialog(mainWindow, {
        title: `Bonnetje Opslaan (${isPrive ? 'Privé' : 'Zakelijk'})`,
        defaultPath: path.join(defaultDir, filename),
        filters: [{ name: 'Afbeeldingen / Bestanden', extensions: ['jpg', 'jpeg', 'png', 'pdf'] }]
      });
      if (dialogResult.canceled || !dialogResult.filePath) {
        return { success: false, message: 'Opslaan geannuleerd.' };
      }
      targetPath = dialogResult.filePath;
    }

    const buffer = Buffer.from(base64Data.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    fs.writeFileSync(targetPath, buffer);
    return { success: true, path: targetPath };
  } catch (err) {
    console.error('Fout bij opslaan bonnetje:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('read-folder', async (event, folderPath) => {
  try {
    const settings = loadSettings();
    let targetPath = folderPath || settings.rootDriveFolder;
    if (!targetPath) {
      return { success: false, error: 'Er is nog geen Google Drive hoofdmap ingesteld.' };
    }
    if (!fs.existsSync(targetPath)) {
      return { success: false, error: `Map '${targetPath}' bestaat niet op dit systeem.` };
    }
    const items = fs.readdirSync(targetPath, { withFileTypes: true });
    const result = items
      .filter(item => !item.name.startsWith('.'))
      .map(item => {
        const fullPath = path.join(targetPath, item.name);
        let stat = { size: 0, mtime: new Date() };
        try {
          stat = fs.statSync(fullPath);
        } catch (e) {}
        return {
          name: item.name,
          isDirectory: item.isDirectory(),
          size: stat.size,
          mtime: stat.mtime,
          fullPath
        };
      });

    result.sort((a, b) => {
      if (a.isDirectory === b.isDirectory) {
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      }
      return a.isDirectory ? -1 : 1;
    });

    return {
      success: true,
      currentPath: targetPath,
      rootPath: settings.rootDriveFolder,
      parentPath: path.dirname(targetPath) !== targetPath ? path.dirname(targetPath) : null,
      items: result
    };
  } catch (err) {
    console.error('Fout bij lezen map:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('open-path', async (event, filePath) => {
  try {
    if (filePath && fs.existsSync(filePath)) {
      await shell.openPath(filePath);
      return { success: true };
    }
    return { success: false, error: 'Bestand bestaat niet.' };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('show-in-folder', async (event, filePath) => {
  try {
    if (filePath && fs.existsSync(filePath)) {
      shell.showItemInFolder(filePath);
      return { success: true };
    }
    return { success: false, error: 'Bestand of map bestaat niet.' };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
