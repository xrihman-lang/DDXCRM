/**
 * GDX CRM - Standalone WhatsApp & Token Management Backend
 * 
 * DEPLOYMENT INSTRUCTIONS FOR RENDER:
 * 1. Create a new private repository on GitHub.
 * 2. Copy this file into the repository and rename it to `index.js`.
 * 3. Create a `package.json` in the same repository with the following content:
 *    {
 *      "name": "gdx-whatsapp-backend",
 *      "main": "index.js",
 *      "scripts": {
 *        "start": "node index.js"
 *      },
 *      "dependencies": {
 *        "express": "^4.21.2",
 *        "cors": "^2.8.5"
 *      }
 *    }
 * 4. Go to Render.com -> New Web Service -> Connect your GitHub repository.
 * 5. Render will automatically detect Node.js, install dependencies, and turn this into a live server.
 */

import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

// Render automatically provides the PORT environment variable
const PORT = process.env.PORT || 3000;

// In-memory token store for multi-user handling
// (For a production system, replace this Map with a database like MongoDB or Firebase)
const userTokens = new Map();

/**
 * API: Register or Update Tokens for a User/Instance
 * This handles the secure storage of WhatsApp instance IDs and API keys.
 */
app.post('/api/tokens/register', (req, res) => {
    const { instanceId, accessToken, webhookUrl } = req.body;

    if (!instanceId || !accessToken) {
        return res.status(400).json({ success: false, error: 'instanceId and accessToken are required.' });
    }

    userTokens.set(instanceId, {
        accessToken,
        webhookUrl: webhookUrl || null,
        connectedAt: new Date().toISOString()
    });

    console.log(`[🔑 TokenManager] Tokens securely registered for instance: ${instanceId}`);
    res.status(200).json({ success: true, message: 'Tokens stored successfully', instanceId });
});

/**
 * API: Get Instance Connection Status
 */
app.get('/api/tokens/status/:instanceId', (req, res) => {
    const { instanceId } = req.params;
    const data = userTokens.get(instanceId);
    
    if (!data) {
        return res.status(404).json({ success: false, error: 'Instance not found or not connected.' });
    }
    
    res.status(200).json({ success: true, instanceId, connectedAt: data.connectedAt });
});

/**
 * API: Centralized WhatsApp Webhook Gateway
 * Handles live incoming messages and routes them securely based on the user's instance tokens.
 */
app.post('/v1/webhook', (req, res) => {
    // Determine the instance from query params or payload
    const instanceId = req.query.instanceId || req.body.instanceId;
    const payload = req.body;

    console.log(`[📡 Webhook] Incoming event...`);

    if (!instanceId || !userTokens.has(instanceId)) {
        console.warn(`[⚠️ Error] Unregistered webhook attempt. Instance: ${instanceId}`);
        return res.status(401).json({ success: false, error: 'Unauthorized instance' });
    }

    const credentials = userTokens.get(instanceId);
    console.log(`[✅ Webhook] Routing message securely using token for ${instanceId}. Payload:`, payload);

    // Provide the customer logic here (e.g., Forwarding to your AI model or saving to DB)
    // using credentials.accessToken

    res.status(200).send('Event successfully processed via GDX Automation');
});

/**
 * API: Server Health Check
 * Required for Render to verify the environment is active and successfully deployed.
 */
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'Online', 
        platform: 'Render',
        activeInstances: userTokens.size 
    });
});

// Boot the server
app.listen(PORT, () => {
    console.log(`🚀 GDX Token & Webhook Server is LIVE on port ${PORT}`);
});
