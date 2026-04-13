const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { ChatGPTAPI } = require('chatgpt');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Initialize ChatGPT integration
const chatgpt = new ChatGPTAPI({ apiKey: process.env.CHATGPT_API_KEY });

// Endpoint to analyze ideas
app.post('/api/analyze-ideas', async (req, res) => {
    try {
        const { ideas } = req.body;
        const response = await chatgpt.analyzeIdeas(ideas);
        res.status(200).json(response);
    } catch (error) {
        res.status(500).json({ error: 'Error analyzing ideas', details: error.message });
    }
});

// Endpoint to generate code
app.post('/api/generate-code', async (req, res) => {
    try {
        const { prompt } = req.body;
        const response = await chatgpt.generateCode(prompt);
        res.status(200).json(response);
    } catch (error) {
        res.status(500).json({ error: 'Error generating code', details: error.message });
    }
});

// Endpoint to ask ChatGPT
app.post('/api/ask', async (req, res) => {
    try {
        const { question } = req.body;
        const response = await chatgpt.ask(question);
        res.status(200).json(response);
    } catch (error) {
        res.status(500).json({ error: 'Error asking question', details: error.message });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
