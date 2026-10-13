'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { validateKey, validateModel, DEFAULT_TEXT_MODEL, DEFAULT_IMAGE_MODEL } = require('./gemini.cjs');

function createSettingsStore({ directory, safeStorage }) {
  const settingsPath = path.join(directory, 'settings.json');
  let queue = Promise.resolve();

  async function read() {
    try {
      const stat = await fs.stat(settingsPath);
      if (stat.size > 65536) throw new Error('Settings could not be read.');
      const raw = JSON.parse(await fs.readFile(settingsPath, 'utf8'));
      return {
        textModel: validateModel(raw.textModel || DEFAULT_TEXT_MODEL),
        imageModel: validateModel(raw.imageModel || DEFAULT_IMAGE_MODEL),
        encryptedKey: typeof raw.encryptedKey === 'string' && raw.encryptedKey.length < 4096 ? raw.encryptedKey : null,
      };
    } catch (error) {
      if (error.code === 'ENOENT') return { textModel: DEFAULT_TEXT_MODEL, imageModel: DEFAULT_IMAGE_MODEL, encryptedKey: null };
      throw new Error('Visro settings could not be read. You can reset the settings file in your application support folder.');
    }
  }

  function publicSettings(value) {
    const available = Boolean(safeStorage.isEncryptionAvailable());
    return { hasKey: Boolean(value.encryptedKey), textModel: value.textModel, imageModel: value.imageModel, secureStorage: available, encryptionAvailable: available };
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

  function saveSettings(input) {
    const task = queue.then(async () => {
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid settings.');
      const settings = await read();
      if (input.textModel !== undefined) settings.textModel = validateModel(input.textModel);
      if (input.imageModel !== undefined) settings.imageModel = validateModel(input.imageModel);
      if (input.clearKey === true) settings.encryptedKey = null;
      if (input.apiKey !== undefined && input.apiKey !== '') {
        const key = validateKey(input.apiKey);
        if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure key storage is unavailable. Unlock your macOS keychain and try again.');
        settings.encryptedKey = safeStorage.encryptString(key).toString('base64');
      }
      await write(settings);
      return publicSettings(settings);
    });
    queue = task.catch(() => {});
    return task;
  }

  async function getCredentials() {
    const settings = await read();
    if (!settings.encryptedKey) throw new Error('Add your Gemini API key in Settings to use AI tools.');
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Unlock your macOS keychain to use the saved Gemini key.');
    let apiKey;
    try { apiKey = validateKey(safeStorage.decryptString(Buffer.from(settings.encryptedKey, 'base64'))); } catch { throw new Error('Your saved Gemini key could not be unlocked. Add it again in Settings.'); }
    return { apiKey, textModel: settings.textModel, imageModel: settings.imageModel };
  }

  return { getSettings, saveSettings, getCredentials };
}

module.exports = { createSettingsStore };
