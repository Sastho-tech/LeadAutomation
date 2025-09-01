import "dotenv/config";
import express from "express";
import fetch from "node-fetch";
import { Client } from "@notionhq/client";
import crypto from "crypto";

const app = express();
app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf; }
}));

// Notion client
const notion = new Client({ auth: process.env.NOTION_TOKEN });

// Facebook API to fetch lead details
async function getLeadDetails(leadgenId) {
  const pageAccessToken = 'EAAPML8hCW7ABPXOGfk3KejaETWzwryV5WPcfkg6OP5eamf85PEus1o6ZB2xYBPiAcFpxzuZBdqYuXtZCjyBzGqt2QtERdcIIlXT75vgslEDUq8ho5w9ejai1FLx0w8ZAY2O82LTaPacwIXMZBcObSMdv4VOWBxaHKln0Tyom23FTf2wiWxaG9Hs8xhRNVVsytAQ5pMbEOwwaQfUHb9jQomAD3iRINAuBRw7wUm4olaz9AoIzGqleOPywZD'; // Update this
  const url = `https://graph.facebook.com/v13.0/${leadgenId}?access_token=${pageAccessToken}`;
  try {
    const response = await fetch(url);
    const data = await response.json();
    return data;  // This will contain the full lead details
  } catch (err) {
    console.error("Error fetching lead from Facebook:", err);
  }
}

// Push lead data to Notion
async function pushLeadToNotion(lead) {
  try {
    await notion.pages.create({
      parent: { database_id: process.env.NOTION_DB }, // your Notion database ID
      properties: {
        SL: {
          number: lead.sl || 1, // You can set this as an increment or use a static value
        },
        "Full Name": {
          title: [{ text: { content: lead.fullName || "Unknown" } }]
        },
        "Hospital Name": {
          rich_text: [{ text: { content: lead.hospitalName || "N/A" } }]
        },
        "Phone Number": {
          rich_text: [{ text: { content: lead.phoneNumber || "-" } }]
        },
        Location: {
          rich_text: [{ text: { content: lead.location || "N/A" } }]
        }
      }
    });
    console.log("✅ Lead pushed to Notion!");
  } catch (err) {
    console.error("❌ Failed to push lead to Notion:", err);
  }
}

// --- Webhook endpoint (POST) ---
app.post("/fb-webhook", async (req, res) => {
  if (!isValidSignature(req)) {
    console.warn("Invalid signature from Meta");
    return res.sendStatus(401);
  }
  
  res.sendStatus(200);  // Always 200 ASAP

  try {
    if (req.body?.object === "page") {
      for (const entry of req.body.entry || []) {
        for (const change of entry.changes || []) {
          if (change.field === "leadgen") {
            const leadgenId = change?.value?.leadgen_id;
            const pageId = change?.value?.page_id;
            console.log("✅ New lead notification:", { leadgenId, pageId });

            // Fetch the full lead data from Facebook
            const leadData = await getLeadDetails(leadgenId);
            console.log("Lead Data:", leadData);

            // Create lead object to match Notion structure
            const lead = {
              sl: leadData.id,  // You can use an incrementing serial or leadgenId as SL
              fullName: leadData.full_name,
              hospitalName: leadData.hospital_name, // Assuming leadData contains this field
              phoneNumber: leadData.phone,
              location: leadData.location,  // Assuming leadData contains this field
            };

            // Push the lead data to Notion
            await pushLeadToNotion(lead);
          }
        }
      }
    }
  } catch (e) {
    console.error("Error handling webhook:", e);
  }
});

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Listening on :${PORT}`));

