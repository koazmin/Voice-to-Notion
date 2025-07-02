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
        const { question, transcript } = req.body; // 'question' can now be empty

        if (!transcript || transcript.trim() === '') {
            return res.status(400).json({ error: 'No transcript provided for Gemini to analyze.' });
        }

        const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
        let prompt = '';

        if (question && question.trim() !== '') {
            // If a specific question is provided, use it with the transcript as context
            prompt = `Given the following Burmese text:\n\n"${transcript}"\n\nAnswer the following question in Burmese. Provide only the answer, without any introductory or concluding remarks:\n\nQuestion: ${question}`;
        } else {
            // If no specific question, summarize/analyze the transcript automatically
            prompt = `Analyze the following Burmese text and provide a concise overview or summary of its main points in Burmese. Provide only the overview/summary, without any introductory or concluding remarks.\n\nText:\n${transcript}`;
        }

        console.log(`Asking Gemini: "${question || 'General analysis of transcript'}" with transcript context...`);
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
