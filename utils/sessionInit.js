// @path: utils/sessionInit.js
import { useMultiFileAuthState } from '@whiskeysockets/baileys'

export const initAuthState = async sessionPath => {
  const { state, saveCreds } = await useMultiFileAuthState(sessionPath)
  return { state, saveCreds }
}
