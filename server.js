const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();

const OpenAI = require("openai");

const app = express();
const PORT = process.env.PORT || 3000;

// OpenAI setup
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Middleware
app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '20mb' }));

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Firebase Config API
app.get('/api/firebase-config', (req, res) => {
    res.json({
        apiKey: process.env.FIREBASE_API_KEY,
        authDomain: process.env.FIREBASE_AUTH_DOMAIN,
        projectId: process.env.FIREBASE_PROJECT_ID,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.FIREBASE_APP_ID,
        measurementId: process.env.FIREBASE_MEASUREMENT_ID || ""
    });
});

// AI Transcription API (OpenAI)
app.post('/api/analyze-prescription', async (req, res) => {
    try {
        const { image } = req.body;
        if (!image) return res.status(400).json({ error: "Missing image data" });

        const base64Data = image.includes(',') ? image.split(',')[1] : image;

        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: "Act as a senior medical pharmacist. Extract prescription details. Return ONLY valid JSON."
                },
                {
                    role: "user",
                    content: [
                        {
                            type: "text", text: `Extract details into this format: 
                        {
                          "medicine": "name", 
                          "dosage": "e.g. 500mg", 
                          "frequency": "e.g. 1-0-1", 
                          "duration": "e.g. 7 days", 
                          "doctor": "name", 
                          "confidence": number between 0-100
                        }` },
                        {
                            type: "image_url",
                            image_url: {
                                url: `data:image/jpeg;base64,${base64Data}`,
                            },
                        },
                    ],
                },
            ],
            response_format: { type: "json_object" }
        });

        const aiResult = JSON.parse(response.choices[0].message.content);
        res.json(aiResult);
    } catch (err) {
        console.error("OpenAI API Error:", err);
        res.status(500).json({ error: "System-level AI analysis failed." });
    }
});

// API Routes (can be expanded later for prescriptions/profiles)
app.get('/api/health', (req, res) => {
    res.json({
        status: 'UP',
        timestamp: new Date().toISOString()
    });
});

// Fallback for SPA (if routing is needed later)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
app.listen(PORT, () => {
    console.log(`-------------------------------------------------`);
    console.log(`🚀 MediLens Server is running at: http://localhost:${PORT}`);
    console.log(`🛡️  Mode: ${process.env.NODE_ENV || 'development'}`);
    console.log(`-------------------------------------------------`);
});
