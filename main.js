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

function getAlgemeneBestandenFolder() {
  const settings = loadSettings();
  const candidates = [
    settings.rootDriveFolder,
    settings.verkoopfacturenFolder,
    settings.offertesFolder,
    settings.invoicesFolder
  ].filter(Boolean);

  for (const folder of candidates) {
    let current = folder;
    for (let i = 0; i < 5; i++) {
      if (!current || current === '/' || current === path.dirname(current)) break;
      const algemeneDir = path.join(current, 'algemeneBestanden');
      if (fs.existsSync(algemeneDir)) {
        return algemeneDir;
      }
      if (path.basename(current).toLowerCase().includes('ceesaistudio') || path.basename(current) === '2026') {
        const target = path.join(current, 'algemeneBestanden');
        if (!fs.existsSync(target)) {
          try { fs.mkdirSync(target, { recursive: true }); } catch (e) {}
        }
        return target;
      }
      current = path.dirname(current);
    }
  }

  const knownDrive = '/Users/ceesoddens/Library/CloudStorage/GoogleDrive-cees.oddens@gmail.com/Mijn Drive/CeesAIStudio/algemeneBestanden';
  if (fs.existsSync(path.dirname(knownDrive))) {
    if (!fs.existsSync(knownDrive)) {
      try { fs.mkdirSync(knownDrive, { recursive: true }); } catch (e) {}
    }
    return knownDrive;
  }
  return null;
}

function loadKlanten() {
  try {
    if (fs.existsSync(klantenPath)) {
      const data = JSON.parse(fs.readFileSync(klantenPath, 'utf8'));
      if (Array.isArray(data) && data.length > 0) {
        return data;
      }
    }
  } catch (err) {
    console.error('Fout bij het laden van klanten uit userData:', err);
  }

  const algemeneFolder = getAlgemeneBestandenFolder();
  if (algemeneFolder) {
    const driveKlantenPath = path.join(algemeneFolder, 'klanten.json');
    try {
      if (fs.existsSync(driveKlantenPath)) {
        const data = JSON.parse(fs.readFileSync(driveKlantenPath, 'utf8'));
        if (Array.isArray(data) && data.length > 0) {
          saveKlanten(data);
          return data;
        }
      }
    } catch (e) {
      console.warn('Kon klanten niet laden uit Google Drive algemeneBestanden:', e);
    }
  }

  saveKlanten(initialKlanten);
  return initialKlanten;
}

function saveKlanten(klanten) {
  try {
    fs.writeFileSync(klantenPath, JSON.stringify(klanten, null, 2), 'utf8');
    const algemeneFolder = getAlgemeneBestandenFolder();
    if (algemeneFolder) {
      if (!fs.existsSync(algemeneFolder)) {
        fs.mkdirSync(algemeneFolder, { recursive: true });
      }
      const driveKlantenPath = path.join(algemeneFolder, 'klanten.json');
      fs.writeFileSync(driveKlantenPath, JSON.stringify(klanten, null, 2), 'utf8');
    }
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

function resolveTargetDirectory({ baseFolder, date, docType, subType, quarter: customQuarter }) {
  const settings = loadSettings();
  let targetDir = baseFolder;

  // Primary fallback if specific folder not set or doesn't exist: use rootDriveFolder
  if ((!targetDir || !fs.existsSync(targetDir)) && settings.rootDriveFolder) {
    targetDir = settings.rootDriveFolder;
  }

  if (!targetDir) return '';

  const lowerDir = targetDir.toLowerCase();
  const quarter = customQuarter || getQuarterString(date);

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
    // Check if 2026 subfolder exists under root
    const yearDir = path.join(result, '2026');
    if (fs.existsSync(yearDir)) {
      result = path.join(yearDir, quarter);
    } else {
      result = path.join(result, quarter);
    }
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

function parseReceiptFilename(filename, fileStats) {
  const ext = path.extname(filename);
  let nameWithoutExt = path.basename(filename, ext);

  // 1. Date extraction (YYYY-MM-DD or DD-MM-YYYY)
  let datum = '';
  const dateMatch = nameWithoutExt.match(/(\d{4}-\d{2}-\d{2})/) || nameWithoutExt.match(/(\d{2}-\d{2}-\d{4})/);
  if (dateMatch) {
    let rawDate = dateMatch[1];
    if (rawDate.match(/^\d{2}-\d{2}-\d{4}$/)) {
      const parts = rawDate.split('-');
      datum = `${parts[2]}-${parts[1]}-${parts[0]}`;
    } else {
      datum = rawDate;
    }
  } else if (fileStats && fileStats.mtime) {
    datum = new Date(fileStats.mtime).toISOString().split('T')[0];
  } else {
    datum = new Date().toISOString().split('T')[0];
  }

  // 2. Amount extraction (e.g. 29,04 or 29.04 or _29,04 or €29,04)
  let bedrag = 0;
  const amountMatch = nameWithoutExt.match(/(?:_|€|\b)(\d+[\.,]\d{2})\b/);
  if (amountMatch) {
    const rawNum = amountMatch[1].replace(',', '.');
    bedrag = parseFloat(rawNum) || 0;
  }

  // 3. Clean description
  let omschrijving = nameWithoutExt;
  if (dateMatch) {
    omschrijving = omschrijving.replace(dateMatch[0], '');
  }
  if (amountMatch) {
    omschrijving = omschrijving.replace(amountMatch[0], '');
  }
  omschrijving = omschrijving
    .replace(/^[\s_#-]+|[\s_#-]+$/g, '')
    .replace(/[\s_]+/g, ' ');

  if (!omschrijving) {
    omschrijving = nameWithoutExt;
  }

  // 4. Category auto-detection
  let categorie = 'Software';
  const lower = nameWithoutExt.toLowerCase();
  if (/(tank|benzine|ns|trein|ov|uber|parking|parkeren|shell|tinq|esso|tango)/i.test(lower)) {
    categorie = 'Reizen';
  } else if (/(lunch|diner|koffie|restaurant|horeca|brasserie|eetcafé|supermarkt|albert|jumbo)/i.test(lower)) {
    categorie = 'Eten & Drinken';
  } else if (/(kantoor|papier|inkt|postnl|staples|action|zeeman|hema)/i.test(lower)) {
    categorie = 'Kantoor';
  } else if (/(monitor|laptop|kabel|usb|muis|toetsenbord|apple|bol|coolblue|hardware)/i.test(lower)) {
    categorie = 'Hardware';
  } else if (/(paddle|n8n|github|openai|anthropic|adobe|google|aws|cloudflare|hosting|domein|software|app|factuur)/i.test(lower)) {
    categorie = 'Software';
  } else {
    categorie = 'Overig';
  }

  return {
    omschrijving,
    bedrag,
    datum,
    categorie
  };
}

ipcMain.handle('scan-bonnetjes', async (event, { quarter, year }) => {
  try {
    const settings = loadSettings();
    const targetQuarter = quarter || 'Q3';
    const targetYear = year || '2026';

    let rootFolder = settings.rootDriveFolder;
    if (!rootFolder) {
      const candidate = getAlgemeneBestandenFolder();
      if (candidate) {
        rootFolder = path.dirname(candidate);
      }
    }

    if (!rootFolder || !fs.existsSync(rootFolder)) {
      return { success: false, items: [], error: 'Hoofdmap niet gevonden.' };
    }

    // Determine candidate quarter folders
    const potentialPaths = [
      path.join(rootFolder, targetYear, targetQuarter, 'inkoopfacturen'),
      path.join(rootFolder, targetQuarter, 'inkoopfacturen'),
      path.join(rootFolder, 'inkoopfacturen')
    ];

    let inkoopDir = potentialPaths.find(p => fs.existsSync(p));
    if (!inkoopDir) {
      inkoopDir = path.join(rootFolder, targetYear, targetQuarter, 'inkoopfacturen');
      try {
        fs.mkdirSync(path.join(inkoopDir, 'zakelijk'), { recursive: true });
        fs.mkdirSync(path.join(inkoopDir, 'prive'), { recursive: true });
      } catch (e) {}
    }

    const subTypes = ['zakelijk', 'prive'];
    const scannedItems = [];

    for (const subType of subTypes) {
      const dirPath = path.join(inkoopDir, subType);
      if (!fs.existsSync(dirPath)) continue;

      const files = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const file of files) {
        if (file.isDirectory() || file.name.startsWith('.')) continue;
        const ext = path.extname(file.name).toLowerCase();
        if (!['.pdf', '.png', '.jpg', '.jpeg', '.webp'].includes(ext)) continue;

        const fullPath = path.join(dirPath, file.name);
        let stat = { size: 0, mtime: new Date() };
        try { stat = fs.statSync(fullPath); } catch (e) {}

        const parsed = parseReceiptFilename(file.name, stat);

        let isPdf = ext === '.pdf';
        let foto = null;
        if (!isPdf) {
          try {
            const buf = fs.readFileSync(fullPath);
            const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
            foto = `data:${mime};base64,${buf.toString('base64')}`;
          } catch (e) {}
        }

        scannedItems.push({
          id: `scan-${subType}-${file.name}`,
          filename: file.name,
          fullPath,
          subType,
          isDiskScan: true,
          isPdf,
          foto,
          omschrijving: parsed.omschrijving,
          bedrag: parsed.bedrag,
          btw: 21,
          btwBedrag: parsed.bedrag / 1.21 * 0.21,
          datum: parsed.datum,
          categorie: parsed.categorie,
          size: stat.size,
          mtime: stat.mtime
        });
      }
    }

    return { success: true, items: scannedItems, inkoopDir };
  } catch (err) {
    console.error('Fout bij scannen bonnetjes:', err);
    return { success: false, items: [], error: err.message };
  }
});
