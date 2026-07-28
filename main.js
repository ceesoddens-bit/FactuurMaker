const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

// Settings file path in UserData
const settingsPath = path.join(app.getPath('userData'), 'factuur_maker_settings.json');
const klantenPath = path.join(app.getPath('userData'), 'factuur_maker_klanten.json');

const initialKlanten = [
  {
    id: 'klant-woonwensmakelaar',
    name: 'Woonwensmakelaar',
    contact: 't.a.v. Ronaldo Lemmens',
    address: 'Pastoor Vonckenstraat 21',
    zipCity: '6161 GE Geleen',
    kvk: '80707823',
    btw: 'NL003482523B06',
    formattedClientText: `Woonwensmakelaar\nt.a.v. Ronaldo Lemmens\nPastoor Vonckenstraat 21\n6161 GE Geleen\n\nKVK: 80707823\nBTW: NL003482523B06`,
    defaultLines: [
      { description: 'AI werkzaamheden - geleverd in juni 2026', quantity: 1, rate: 850 },
      { description: 'AI werkzaamheden - geleverd in juli 2026', quantity: 1, rate: 850 }
    ]
  },
  {
    id: 'klant-de-graphics',
    name: 'De Graphics',
    contact: 't.a.v. Rogier Leijen',
    address: 'Naarderweg 16',
    zipCity: '1217 GL Hilversum',
    kvk: '72440295',
    btw: '',
    formattedClientText: `De Graphics\nt.a.v. Rogier Leijen\nNaarderweg 16\n1217 GL Hilversum\n\nKVK: 72440295`,
    defaultLines: [
      { description: 'Motion Graphics Carbon Equity\nUitgevoerd in april/mei 2026', quantity: 1, rate: 600 }
    ]
  }
];

function loadKlanten() {
  try {
    if (fs.existsSync(klantenPath)) {
      const data = JSON.parse(fs.readFileSync(klantenPath, 'utf8'));
      if (Array.isArray(data) && data.length > 0) {
        return data;
      }
    }
  } catch (err) {
    console.error('Fout bij het laden van klanten:', err);
  }
  // Try fallback to Google Drive folder if available
  const settings = loadSettings();
  if (settings.rootDriveFolder) {
    const driveKlantenPath = path.join(settings.rootDriveFolder, 'klanten.json');
    try {
      if (fs.existsSync(driveKlantenPath)) {
        const data = JSON.parse(fs.readFileSync(driveKlantenPath, 'utf8'));
        if (Array.isArray(data) && data.length > 0) {
          saveKlanten(data);
          return data;
        }
      }
    } catch (e) {
      console.warn('Kon klanten niet laden uit Google Drive map:', e);
    }
  }
  // Save default seed clients if no file exists yet
  saveKlanten(initialKlanten);
  return initialKlanten;
}

function saveKlanten(klanten) {
  try {
    fs.writeFileSync(klantenPath, JSON.stringify(klanten, null, 2), 'utf8');
    const settings = loadSettings();
    const driveFolders = [
      settings.rootDriveFolder,
      settings.verkoopfacturenFolder,
      settings.invoicesFolder
    ].filter(Boolean);

    // Also add parent directory of rootDriveFolder or invoicesFolder if applicable
    if (settings.rootDriveFolder) {
      driveFolders.push(path.dirname(settings.rootDriveFolder));
    }
    if (settings.invoicesFolder) {
      driveFolders.push(path.dirname(settings.invoicesFolder));
    }

    const uniqueFolders = [...new Set(driveFolders)];
    uniqueFolders.forEach(folder => {
      try {
        if (folder && fs.existsSync(folder)) {
          const driveKlantenPath = path.join(folder, 'klanten.json');
          fs.writeFileSync(driveKlantenPath, JSON.stringify(klanten, null, 2), 'utf8');
        }
      } catch (errDrive) {
        console.warn(`Kon klanten.json niet naar ${folder} schrijven:`, errDrive);
      }
    });

    return { success: true };
  } catch (err) {
    console.error('Fout bij het opslaan van klanten:', err);
    return { success: false, error: err.message };
  }
}

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

ipcMain.handle('get-klanten', () => {
  return loadKlanten();
});

ipcMain.handle('save-klanten', (event, klanten) => {
  return saveKlanten(klanten);
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

ipcMain.handle('save-pdf-file', async (event, { filename, base64Data, pdfArrayBuffer, docType, date }) => {
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

    let buffer;
    if (pdfArrayBuffer) {
      buffer = Buffer.from(pdfArrayBuffer);
    } else if (base64Data) {
      const cleaned = base64Data.replace(/^data:application\/pdf;base64,/, '');
      buffer = Buffer.from(cleaned, 'base64');
    } else {
      return { success: false, error: 'Geen PDF data ontvangen.' };
    }

    if (buffer.length < 100 || !buffer.toString('utf8', 0, 5).startsWith('%PDF')) {
      console.error('Ongeldige PDF data ontvangen');
      return { success: false, error: 'Het gegenereerde bestand bevat geen geldige PDF data.' };
    }

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
      const errMsg = await shell.openPath(filePath);
      if (errMsg) {
        return { success: false, error: errMsg };
      }
      return { success: true };
    }
    return { success: false, error: `Bestand niet gevonden op: ${filePath}` };
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
    return { success: false, error: `Bestand niet gevonden op: ${filePath}` };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
