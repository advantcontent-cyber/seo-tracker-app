// Minimal Google Drive integration for the draft cron — no SDK dependency.
// Signs a service-account JWT with node:crypto, exchanges it for an access
// token, and creates a Google Doc (text converted to Docs) in a given folder.
//
// Setup:
//   1. Create a Google Cloud service account, enable the Drive API, download
//      its JSON key.
//   2. Put the JSON (whole object) in env GOOGLE_SERVICE_ACCOUNT_KEY.
//   3. Share the target Drive folder(s) with the service account's
//      client_email (Editor), so it can create files there.

import crypto from "node:crypto";

const TOKEN_URI = "https://oauth2.googleapis.com/token";
const SCOPE     = "https://www.googleapis.com/auth/drive";

const b64url = (buf) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// Returns the parsed service-account credentials, or null if not configured.
export function getServiceAccount() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) return null;
  try {
    const sa = JSON.parse(raw);
    if (sa.private_key) sa.private_key = sa.private_key.replace(/\\n/g, "\n");
    return sa;
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY is not valid JSON");
  }
}

async function getAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: SCOPE,
    aud: TOKEN_URI,
    iat: now,
    exp: now + 3600,
  }));
  const signingInput = `${header}.${claim}`;
  const signature = b64url(
    crypto.createSign("RSA-SHA256").update(signingInput).sign(sa.private_key)
  );
  const assertion = `${signingInput}.${signature}`;

  const res = await fetch(TOKEN_URI, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) throw new Error(`Google token ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).access_token;
}

// Creates a Google Doc from plain text in `folderId`. Returns its webViewLink.
// Throws if not configured or the API call fails.
export async function createGoogleDoc({ title, text, folderId }) {
  const sa = getServiceAccount();
  if (!sa) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY not set");
  const accessToken = await getAccessToken(sa);

  const boundary = "seo-tracker-" + crypto.randomUUID();
  const metadata = {
    name: title,
    mimeType: "application/vnd.google-apps.document", // converts the text/plain body
    ...(folderId ? { parents: [folderId] } : {}),
  };
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n` +
    `${text}\r\n` +
    `--${boundary}--`;

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink&supportsAllDrives=true",
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );
  if (!res.ok) throw new Error(`Drive create ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const file = await res.json();
  return file.webViewLink || `https://docs.google.com/document/d/${file.id}/edit`;
}
