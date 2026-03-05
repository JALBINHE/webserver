const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: function(origin, callback) {
    const allowedOrigins = [
      'http://localhost:5173',
      'http://localhost:5175',
      /\.netlify\.app$/,
      /\.vercel\.app$/
    ];
    
    if (!origin) return callback(null, true);
    
    const isAllowed = allowedOrigins.some(allowed => {
      if (typeof allowed === 'string') return allowed === origin;
      return allowed.test(origin);
    });
    
    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['POST', 'GET'],
  allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
  maxAge: 600
}));
app.use(cookieParser());
app.use(express.json());

// Simple CSRF token generation and validation
const csrfTokens = new Set();

app.get('/api/csrf-token', (req, res) => {
  const token = crypto.randomBytes(32).toString('hex');
  csrfTokens.add(token);
  setTimeout(() => csrfTokens.delete(token), 600000); // Token expires in 10 minutes
  res.json({ csrfToken: token });
});

// Initialize WhatsApp Client with local session saving
// Puppeteer args to ensure it runs smoothly on various systems
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

let isClientReady = false;

client.on('qr', (qr) => {
    // Terminal logs to inform the user to scan
    console.log('\n=========================================');
    console.log('    🚨 ACTION REQUIRED: SCAN QR CODE 🚨    ');
    console.log('=========================================');
    console.log('Please open WhatsApp on your phone, go to "Linked Devices", and scan this QR code:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('\n✅ WhatsApp Server is Successfully Linked and Ready to Send!');
    isClientReady = true;
});

client.on('auth_failure', msg => {
    console.error('❌ AUTHENTICATION FAILURE', msg);
});

client.initialize();


// API Endpoint to send confirmation messages
app.post('/api/send-confirmation', async (req, res) => {
    // CSRF token validation
    const csrfToken = req.headers['x-csrf-token'];
    if (!csrfToken || !csrfTokens.has(csrfToken)) {
        return res.status(403).json({ success: false, error: 'Invalid CSRF token' });
    }
    csrfTokens.delete(csrfToken); // Use token only once

    if (!isClientReady) {
        console.error('Ping received, but WhatsApp is not logged in.');
        return res.status(503).json({ success: false, error: 'WhatsApp client is not ready. Please scan the QR code in the terminal.' });
    }

    const { phone, name } = req.body;

    if (!phone || !name) {
        return res.status(400).json({ success: false, error: 'Phone number and Name are required.' });
    }

    // Format phone number to WhatsApp required format (e.g. 919876543210@c.us)
    // Strip empty spaces, dashes, or special chars
    let formattedPhone = phone.replace(/\D/g, '');

    // Automatically append India country code (91) if user only entered 10 digits
    if (formattedPhone.length === 10) {
        formattedPhone = '91' + formattedPhone;
    }

    const chatId = `${formattedPhone}@c.us`;

    const message = `Hello *${name}*,

Thank you for registering for our Women's Day Celebration event! 🌸
We have successfully received your registration details and payment screenshot. 

We look forward to celebrating with you!

Warm Regards
JFM N.RAGHUPATHI
JCI KOVILPATTI PRESIDENT - 2026

_This is an automated confirmation receipt._`;

    try {
        await client.sendMessage(chatId, message);
        console.log(`✅ Automated confirmation successfully sent to ${name} at ${formattedPhone}`);
        return res.status(200).json({ success: true, message: 'Message sent successfully.' });
    } catch (error) {
        console.error(`❌ Failed to send message to ${formattedPhone}:`, error);
        return res.status(500).json({ success: false, error: 'Failed to send WhatsApp message.' });
    }
});

// Health check endpoint
app.get('/', (req, res) => {
    res.json({ 
        status: 'running', 
        whatsappReady: isClientReady,
        message: 'WhatsApp Server is running'
    });
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        whatsappReady: isClientReady 
    });
});

app.listen(PORT, () => {
    console.log(`\n=========================================`);
    console.log(`🚀 Automated WhatsApp Server running on port ${PORT}`);
    console.log(`=========================================`);
});
