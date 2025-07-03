// api/ask-gemini.js
// This code should be placed in a file like `api/ask-gemini.js` in your Vercel project's root.

import { GoogleGenerativeAI } from "@google/generative-ai";

// Ensure your environment variables are set in Vercel:
// GEMINI_API_KEY

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        // 'question' will be an empty string from the current UI setup
        // 'transcript' will contain the text from the transcriptOutput box
        const { question, transcript } = req.body; 

        if (!transcript || transcript.trim() === '') {
            return res.status(400).json({ error: 'No transcribed text provided for Gemini to analyze.' });
        }

        const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
        let prompt = '';

        // Since the 'askInput' box is removed from the UI, 'question' will always be empty.
        // We will now interpret the 'transcript' itself as the content Gemini needs to respond to.
        // This prompt instructs Gemini to analyze the provided Burmese text and provide an answer/analysis.
        prompt = `Analyze the following Burmese text and provide a comprehensive answer or analysis based on its content. Respond in Burmese. Provide only the answer/analysis, without any introductory or concluding remarks.\n\nText:\n${transcript}`;
        
        console.log(`Asking Gemini to analyze transcript content. Transcript length: ${transcript.length}`);
        const result = await model.generateContent(prompt);
        const response = result.response;
        const answer = response.text().trim();

        res.status(200).json({ answer: answer });

    } catch (error) {
        console.error('Ask Gemini API Error:', error);
        res.status(500).json({ 
            error: `Failed to get answer from Gemini.`, 
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
}
