import { AppDb, EMPTY_DB } from "./types";

const IDB_NAME = "AttendX_IDB";
const IDB_VERSION = 1;
const STORE_NAME = "app_data";
const DB_KEY = "main_db";

let idbConn: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (idbConn) return resolve(idbConn);
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);

    req.onupgradeneeded = (e) => {
      const database = (e.target as IDBOpenDBRequest).result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = (e) => {
      idbConn = (e.target as IDBOpenDBRequest).result;
      resolve(idbConn);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function loadDb(): Promise<AppDb> {
  const conn = await openDB();
  return new Promise((resolve, reject) => {
    const tx = conn.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(DB_KEY);

    req.onsuccess = () => {
      let db: AppDb = req.result ?? { ...EMPTY_DB };

      if (!req.result) {
        const legacy = localStorage.getItem("attendance_sys_db_v3");
        if (legacy) {
          try {
            db = JSON.parse(legacy) as AppDb;
          } catch {
            /* ignore */
          }
        }
      }

      if (!db.settings) db.settings = { ...EMPTY_DB.settings };
      if (!db.settings.timeoutTime) db.settings.timeoutTime = "16:00";
      if (!db.settings.thresholdMode) db.settings.thresholdMode = "strict";
      if (!db.settings.timeFormat) db.settings.timeFormat = "12h";
      if (db.settings.currentEventId === undefined) db.settings.currentEventId = "";
      if (!db.logs) db.logs = {};
      if (!db.students) db.students = [];
      if (!db.events) db.events = [];
      if (!db.classes) db.classes = [];

      // Migrate older day records missing events map
      for (const dateKey of Object.keys(db.logs)) {
        for (const memberId of Object.keys(db.logs[dateKey] || {})) {
          const rec = db.logs[dateKey][memberId];
          if (!rec.classes) rec.classes = {};
          if (!rec.events) rec.events = {};
          if (!rec.library) rec.library = { timeIn: "", timeOut: "", scans: [] };
          if (!rec.scans) rec.scans = [];
        }
      }

      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function saveDb(db: AppDb): Promise<void> {
  const conn = await openDB();
  return new Promise((resolve, reject) => {
    const tx = conn.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(db, DB_KEY);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function clearDb(): Promise<void> {
  const conn = await openDB();
  return new Promise((resolve, reject) => {
    const tx = conn.transaction(STORE_NAME, "readwrite");
    const req = tx.objectStore(STORE_NAME).clear();
    req.onsuccess = () => {
      localStorage.removeItem("attendance_sys_db_v3");
      resolve();
    };
    req.onerror = () => reject(req.error);
  });
}
