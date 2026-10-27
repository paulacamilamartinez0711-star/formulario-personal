import { google } from "googleapis";
import process from "node:process";
import { getEmployeeDriveFolderName } from "../../shared/driveNaming.js";

function getCredentials() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    try {
      const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
      if (!credentials.client_email || !credentials.private_key) {
        throw new Error("el JSON no contiene client_email o private_key");
      }
      return credentials;
    } catch (error) {
      throw new Error(`GOOGLE_SERVICE_ACCOUNT_JSON no es válido: ${error.message}`, {
        cause: error,
      });
    }
  }

  if (!process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
    throw new Error(
      "Netlify no tiene GOOGLE_SERVICE_ACCOUNT_JSON ni el par GOOGLE_CLIENT_EMAIL/GOOGLE_PRIVATE_KEY configurado."
    );
  }

  return {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  };
}

function getOAuthAuth() {
  const clientJson = process.env.GOOGLE_OAUTH_CLIENT_JSON;
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  if (!clientJson && !refreshToken) return null;
  if (!clientJson || !refreshToken) {
    throw new Error("Configura GOOGLE_OAUTH_CLIENT_JSON y GOOGLE_OAUTH_REFRESH_TOKEN juntos.");
  }

  let downloadedCredentials;
  try {
    downloadedCredentials = JSON.parse(clientJson);
  } catch (error) {
    throw new Error(
      "GOOGLE_OAUTH_CLIENT_JSON debe contener el JSON OAuth descargado de Google Cloud.",
      { cause: error }
    );
  }

  const credentials = downloadedCredentials.installed
    || downloadedCredentials.web
    || downloadedCredentials;
  if (!credentials.client_id || !credentials.client_secret) {
    throw new Error("GOOGLE_OAUTH_CLIENT_JSON no contiene client_id y client_secret.");
  }

  const auth = new google.auth.OAuth2(
    credentials.client_id,
    credentials.client_secret,
    process.env.GOOGLE_OAUTH_REDIRECT_URI
  );
  auth.setCredentials({ refresh_token: refreshToken });
  return auth;
}

export function getGoogleAuth(scopes) {
  const oauthAuth = getOAuthAuth();
  if (oauthAuth) return oauthAuth;

  return new google.auth.GoogleAuth({
    credentials: getCredentials(),
    scopes,
  });
}

export function getDrive() {
  return google.drive({
    version: "v3",
    auth: getGoogleAuth(["https://www.googleapis.com/auth/drive"]),
  });
}

async function findOrCreateFolder(drive, name, parentId) {
  const escapedName = name.replace(/'/g, "\\'");
  const query = [
    "mimeType = 'application/vnd.google-apps.folder'",
    "trashed = false",
    `'${parentId}' in parents`,
    `name = '${escapedName}'`,
  ].join(" and ");

  const result = await drive.files.list({
    q: query,
    fields: "files(id, name)",
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  if (result.data.files?.[0]) return result.data.files[0].id;

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    fields: "id",
    supportsAllDrives: true,
  });

  return created.data.id;
}

export async function getDestinationFolder(drive, cedula, nombreCompleto) {
  const rootId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!rootId) throw new Error("Falta GOOGLE_DRIVE_FOLDER_ID en Netlify.");

  return findOrCreateFolder(
    drive,
    getEmployeeDriveFolderName(cedula, nombreCompleto),
    rootId
  );
}
