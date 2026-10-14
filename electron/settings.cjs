'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { validateKey, validateModel, DEFAULT_TEXT_MODEL, DEFAULT_IMAGE_MODEL } = require('./gemini.cjs');
const DEFAULT_VOICE_MODEL = 'gemini-3.1-flash-tts-preview';
const DEFAULT_VIDEO_MODEL = 'veo-3.1-generate-preview';

function createSettingsStore({ directory, safeStorage }) {
  const settingsPath = path.join(directory, 'settings.json');
  let queue = Promise.resolve();
  let encryptionAvailable;

  async function read() {
    try {
      const stat = await fs.stat(settingsPath);
      if (stat.size > 65536) throw new Error('Settings could not be read.');
      const raw = JSON.parse(await fs.readFile(settingsPath, 'utf8'));
      return {
        textModel: validateModel(raw.textModel || DEFAULT_TEXT_MODEL),
        imageModel: validateModel(raw.imageModel || DEFAULT_IMAGE_MODEL),
        voiceModel: validateModel(raw.voiceModel || DEFAULT_VOICE_MODEL),
        videoModel: validateModel(raw.videoModel || DEFAULT_VIDEO_MODEL),
        encryptedKey: typeof raw.encryptedKey === 'string' && raw.encryptedKey.length < 4096 ? raw.encryptedKey : null,
      };
    } catch (error) {
      if (error.code === 'ENOENT') return { textModel: DEFAULT_TEXT_MODEL, imageModel: DEFAULT_IMAGE_MODEL, voiceModel: DEFAULT_VOICE_MODEL, videoModel: DEFAULT_VIDEO_MODEL, encryptedKey: null };
      throw new Error('Visro settings could not be read. You can reset the settings file in your application support folder.');
    }
  }

  function publicSettings(value) {
    // On macOS even isEncryptionAvailable can synchronously prompt Keychain
    // and block Electron's main loop after an app's signing identity changes.
    // Passive reads report only metadata; capability remains unknown until an
    // explicit key save or AI use actually needs the protected storage.
    return { hasKey: Boolean(value.encryptedKey), textModel: value.textModel, imageModel: value.imageModel, voiceModel: value.voiceModel, videoModel: value.videoModel, ...(encryptionAvailable === undefined ? {} : { secureStorage: encryptionAvailable, encryptionAvailable }) };
  }

  async function checkEncryption() {
    // Production Electron 44 provides all three non-blocking operations. Never
    // fall back to the synchronous APIs, which can freeze the main event loop.
    if (!['isAsyncEncryptionAvailable', 'encryptStringAsync', 'decryptStringAsync'].every((method) => typeof safeStorage[method] === 'function')) {
      encryptionAvailable = false;
      return false;
    }
    try { encryptionAvailable = Boolean(await safeStorage.isAsyncEncryptionAvailable()); }
    catch { encryptionAvailable = false; }
    return encryptionAvailable;
  }

  async function encryptKey(key) {
    try {
      const encrypted = await safeStorage.encryptStringAsync(key);
      if (!Buffer.isBuffer(encrypted) || !encrypted.length || encrypted.toString('base64').length >= 4096) throw new Error('Invalid encrypted bytes.');
      return encrypted.toString('base64');
    } catch { throw new Error('Your Gemini key could not be stored securely. Unlock your macOS keychain and try again.'); }
  }

  async function getSettings() { return publicSettings(await read()); }

  async function write(value) {
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const temporary = `${settingsPath}.${crypto.randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporary, JSON.stringify(value, null, 2), { mode: 0o600, flag: 'wx' });
      await fs.rename(temporary, settingsPath);
      await fs.chmod(settingsPath, 0o600);
    } finally { await fs.unlink(temporary).catch(() => {}); }
  }

  function enqueueWrite(operation) {
    const task = queue.then(operation);
    queue = task.catch(() => {});
    return task;
  }

  function saveSettings(input) {
    return enqueueWrite(async () => {
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid settings.');
      const settings = await read();
      if (input.textModel !== undefined) settings.textModel = validateModel(input.textModel);
      if (input.imageModel !== undefined) settings.imageModel = validateModel(input.imageModel);
      if (input.voiceModel !== undefined) settings.voiceModel = validateModel(input.voiceModel);
      if (input.videoModel !== undefined) settings.videoModel = validateModel(input.videoModel);
      if (input.clearKey === true) settings.encryptedKey = null;
      if (input.apiKey !== undefined && input.apiKey !== '') {
        const key = validateKey(input.apiKey);
        if (!await checkEncryption()) throw new Error('Secure key storage is unavailable. Unlock your macOS keychain and try again.');
        settings.encryptedKey = await encryptKey(key);
      }
      await write(settings);
      return publicSettings(settings);
    });
  }

  async function getCredentials() {
    const settings = await read();
    if (!settings.encryptedKey) throw new Error('Add your Gemini API key in Settings to use AI tools.');
    if (!await checkEncryption()) throw new Error('Unlock your macOS keychain to use the saved Gemini key.');
    let apiKey, shouldReEncrypt;
    try {
      // Electron's async provider accepts legacy ciphertext and identifies data
      // needing migration to its current protected key through shouldReEncrypt.
      const decrypted = await safeStorage.decryptStringAsync(Buffer.from(settings.encryptedKey, 'base64'));
      apiKey = validateKey(decrypted.result);
      shouldReEncrypt = decrypted.shouldReEncrypt === true;
    } catch { throw new Error('Your saved Gemini key could not be unlocked. Unlock your macOS keychain and try again, or add the key again in Settings.'); }
    if (shouldReEncrypt) {
      const encryptedKey = await encryptKey(apiKey);
      await enqueueWrite(async () => {
        const latest = await read();
        // A concurrent explicit key replacement/deletion wins over migration;
        // all model changes are retained from the newest serialized settings.
        if (latest.encryptedKey === settings.encryptedKey) await write({ ...latest, encryptedKey });
      });
    }
    return { apiKey, textModel: settings.textModel, imageModel: settings.imageModel, voiceModel: settings.voiceModel, videoModel: settings.videoModel };
  }

  return { getSettings, saveSettings, getCredentials };
}

module.exports = { createSettingsStore, DEFAULT_VOICE_MODEL, DEFAULT_VIDEO_MODEL };
