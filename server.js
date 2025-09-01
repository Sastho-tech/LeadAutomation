import express from "express";
import crypto from "crypto";
import "dotenv/config";


const app = express();

// Capture raw body for signature verification
app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf; }
}));

// --- 1) Verification endpoint (GET) ---
// Meta will call this once when you add the webhook.
// You must echo back 'hub.challenge' if the verify token matches.
app.get("/fb-webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.FB_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// --- Optional: verify signatures on POSTs from Meta ---
function isValidSignature(req) {
  const signature = req.header("x-hub-signature-256"); // "sha256=..."
  if (!signature || !process.env.FB_APP_SECRET || !req.rawBody) return true; // skip if not configured

  const expected = "sha256=" + crypto
    .createHmac("sha256", process.env.FB_APP_SECRET)
    .update(req.rawBody)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

// --- 2) Receive lead notifications (POST) ---
// Meta sends Page changes here, including `leadgen_id` for new leads.
app.post("/fb-webhook", (req, res) => {
  if (!isValidSignature(req)) {
    console.warn("Invalid signature from Meta");
    return res.sendStatus(401);
  }

  // Always 200 ASAP so Meta knows we received it
  res.sendStatus(200);

  // For now, just log what came in:
  try {
    if (req.body?.object === "page") {
      for (const entry of req.body.entry || []) {
        for (const change of entry.changes || []) {
          if (change.field === "leadgen") {
            const leadgenId = change?.value?.leadgen_id;
            const pageId = change?.value?.page_id;
            console.log("✅ New lead notification:", { leadgenId, pageId });
            // STEP 2 will fetch the lead details using Graph API, then push to Notion.
          }
        }
      }
    }
  } catch (e) {
    console.error("Error handling webhook:", e);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Listening on :${PORT}`));
