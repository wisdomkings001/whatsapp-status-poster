// Wraps whatsapp-web.js: handles login (QR as an image + terminal fallback),
// session persistence, and posting images to WhatsApp Status.
const path = require('path');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode = require('qrcode');
const logger = require('../utils/logger');

let client = null;
let isReady = false;
let lastQr = null;
let lastQrDataUrl = null;
let readyCallbacks = [];

function onReady(callback) {
  if (isReady) {
    callback();
  } else {
    readyCallbacks.push(callback);
  }
}

function init() {
  const puppeteerConfig = {
    headless: true,
    protocolTimeout: 180000,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ]
  };

  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    puppeteerConfig.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    logger.info(`Using system Chromium at: ${process.env.PUPPETEER_EXECUTABLE_PATH}`);
  }

  client = new Client({
    authStrategy: new LocalAuth({ dataPath: path.join(__dirname, '..', '..', '.wwebjs_auth') }),
    puppeteer: puppeteerConfig,
    webVersionCache: {
      type: 'remote',
      remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/{version}.html'
    }
  });

  client.on('qr', async (qr) => {
    lastQr = qr;
    isReady = false;
    logger.info('New QR code ready. Scan it from the admin panel, or use the terminal version below:');
    qrcodeTerminal.generate(qr, { small: true });
    try {
      lastQrDataUrl = await QRCode.toDataURL(qr, { width: 400, margin: 2 });
    } catch (err) {
      logger.error('Failed to render QR as an image:', err.message);
      lastQrDataUrl = null;
    }
  });

  client.on('authenticated', () => {
    logger.info('WhatsApp authenticated successfully.');
  });

  client.on('ready', () => {
    isReady = true;
    lastQr = null;
    lastQrDataUrl = null;
    logger.info('WhatsApp client is ready. Bot can now post to Status.');
    const callbacks = readyCallbacks;
    readyCallbacks = [];
    callbacks.forEach((cb) => cb());
  });

  client.on('auth_failure', (msg) => {
    isReady = false;
    logger.error('WhatsApp authentication failed:', msg);
  });

  client.on('disconnected', (reason) => {
    isReady = false;
    logger.warn('WhatsApp client disconnected:', reason);
  });

  client.initialize();
  return client;
}

async function postToStatus(absoluteImagePath, caption) {
  if (!isReady) {
    throw new Error('WhatsApp client is not ready yet. Make sure the QR code has been scanned.');
  }
  const media = MessageMedia.fromFilePath(absoluteImagePath);
  await client.sendMessage('status@broadcast', media, { caption: caption || '' });
}

function getStatus() {
  return { isReady, hasQr: !!lastQr, qrDataUrl: lastQrDataUrl };
}

module.exports = { init, postToStatus, getStatus, onReady };
