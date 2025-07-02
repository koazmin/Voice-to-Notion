// api/process-transcript.js
// This code should be placed in a file like `api/process-transcript.js` in your Vercel project's root.

import { GoogleGenerativeAI } from "@google/generative-ai";

// Ensure your environment variables are set in Vercel:
// GEMINI_API_KEY

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { text, action } = req.body;

        if (!text || text.trim() === '') {
            return res.status(400).json({ error: 'No text provided for processing.' });
        }
        if (!action) {
            return res.status(400).json({ error: 'No action specified for text processing.' });
        }

        const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
        let prompt = '';
        let resultText = '';

        switch (action) {
            case 'summarize':
                prompt = `Summarize the following Burmese text into a concise paragraph. Focus on the main points and key information. Do not add any introductory or concluding remarks.\n\nText:\n${text}`;
                break;
            case 'translate':
                prompt = `Translate the following Burmese text into clear and natural English. Provide only the English translation, without any introductory or concluding remarks.\n\nText:\n${text}`;
                break;
            default:
                return res.status(400).json({ error: 'Invalid action specified.' });
        }

        console.log(`Processing text for action: ${action}`);
        const result = await model.generateContent(prompt);
        const response = result.response;
        resultText = response.text().trim();

        // Basic post-processing to remove potential leading/trailing whitespace or unwanted phrases
        if (action === 'summarize' && resultText.startsWith('Summary:')) {
            resultText = resultText.substring('Summary:'.length).trim();
        } else if (action === 'translate' && resultText.startsWith('Translation:')) {
            resultText = resultText.substring('Translation:'.length).trim();
        }


        res.status(200).json({ result: resultText });

    } catch (error) {
        console.error('LLM API Error:', error);
        res.status(500).json({ 
            error: `Failed to perform ${req.body.action || 'LLM operation'}.`, 
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
}
