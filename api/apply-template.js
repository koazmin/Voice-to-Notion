// api/apply-template.js
// This code should be placed in a file like `api/apply-template.js` in your Vercel project's root.

import { GoogleGenerativeAI } from "@google/generative-ai";

// Ensure your environment variables are set in Vercel:
// GEMINI_API_KEY

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { text, templateType } = req.body;

        if (!text || text.trim() === '') {
            return res.status(400).json({ error: 'No text provided for template application.' });
        }
        if (!templateType) {
            return res.status(400).json({ error: 'No template type specified.' });
        }

        const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
        let prompt = '';

        switch (templateType) {
            case 'meeting_notes':
                prompt = `Transform the following Burmese text into structured meeting notes. Include sections like "Date:", "Attendees:", "Topics Discussed:", "Decisions Made:", and "Action Items:". If information is missing, state it as "N/A" or "Unknown". Provide the output entirely in Burmese.\n\nText:\n${text}`;
                break;
            case 'brainstorming':
                prompt = `Organize the following Burmese text, which represents a brainstorming session, into key ideas or concepts. Use bullet points or a numbered list. Focus on clarity and distinct ideas. Provide the output entirely in Burmese.\n\nText:\n${text}`;
                break;
            case 'interview':
                prompt = `Format the following Burmese text as an interview transcript. Identify speakers if possible (e.g., "Interviewer:", "Interviewee:"). If not, use "Speaker 1:", "Speaker 2:". Focus on clear dialogue flow. Provide the output entirely in Burmese.\n\nText:\n${text}`;
                break;
            case 'general': 
            default:
                return res.status(200).json({ transformedText: text });
        }

        console.log(`Applying template "${templateType}" to text...`);
        const result = await model.generateContent(prompt);
        const response = result.response;
        const transformedText = response.text().trim();

        res.status(200).json({ transformedText: transformedText });

    } catch (error) {
        console.error('Template API Error:', error);
        res.status(500).json({ 
            error: `Failed to apply template "${req.body.templateType}".`, 
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
}
