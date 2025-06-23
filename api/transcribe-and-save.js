// api/transcribe-and-save.js
// This code should be placed in a file like `api/transcribe-and-save.js` in your Vercel project's root.

import { GoogleGenerativeAI } from "@google/generative-ai";
import { Client as NotionClient } from "@notionhq/client";

// Environment variables (ensure these are set in Vercel)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const notion = new NotionClient({ auth: process.env.NOTION_API_KEY });
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        // Optional API key protection - comment/remove if not needed
        // if (req.headers['x-api-key'] !== process.env.API_KEY) {
        //     return res.status(401).json({ error: 'Unauthorized' });
        // }

        const { audio, mimeType, transcript } = req.body;
        let finalTranscript = transcript;

        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        // Step 1: Transcribe audio if provided
        if (audio && mimeType) {
            const allowedMimeTypes = ['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/ogg', 'audio/webm']; 
            if (!allowedMimeTypes.includes(mimeType)) {
                return res.status(400).json({ error: 'Unsupported audio mime type.' });
            }

            const audioPart = {
                inlineData: {
                    data: audio,
                    mimeType: mimeType
                }
            };

            const prompt = "Transcribe the following Burmese audio.";
            const result = await model.generateContent([prompt, audioPart]);
            finalTranscript = result.response.text();

            if (!finalTranscript) {
                return res.status(500).json({ error: 'Failed to get transcription from Gemini.' });
            }
        } else if (!transcript) {
            return res.status(400).json({ error: 'No audio or text provided for processing.' });
        }

        // Step 2: Spell-check the transcript
        let correctedText = finalTranscript;
        if (finalTranscript && finalTranscript.trim() !== '') {
            try {
                const correctionPrompt = `Correct any spelling or grammar errors in the following Burmese text. Only provide the corrected text, nothing else:\n\n${finalTranscript}`;
                const correctionResult = await model.generateContent(correctionPrompt);
                correctedText = correctionResult.response.text();
            } catch (error) { 
                console.error('Gemini spell correction failed:', error);
                correctedText = finalTranscript;
            }
        }

        // Step 3: Analyze expense details
        let expenseData = { amount: null, category: 'Other', description: 'Voice Note' };

        if (correctedText && correctedText.trim() !== '') {
            try {
                // MODIFIED PROMPT: Emphasize returning ONLY JSON
                const expensePrompt = `From the following Burmese text, identify if it describes an expense or income. If it's an expense, extract the expense amount as a number (or null if not found), the category (choose from: Food, Transport, Utilities, Mahar Unity, Bavin, Rent, Entertainment, Shopping, Health, Education, Bills, Communication, Income, Other), and a brief description. If it's income, extract the amount as a number and set category to 'Income'. Return ONLY the JSON object with keys "amount" (number or null), "category" (string), and "description" (string). Do NOT include any other text or explanation. Example: {"amount": 1000, "category": "Food", "description": "Lunch at restaurant"}.
                \n\nText: "${correctedText}"`;

                const expenseResult = await model.generateContent(expensePrompt);
                let rawJson = expenseResult.response.text();

                // Clean possible code block formatting from Gemini (e.g., ```json...```)
                rawJson = rawJson.replace(/```json|```/g, '').trim();

                // Attempt to parse the JSON. If it fails, log the raw output for debugging.
                try {
                    expenseData = JSON.parse(rawJson);
                } catch (jsonParseError) {
                    console.error("Failed to parse Gemini's JSON response. Raw output:", rawJson, "Error:", jsonParseError);
                    console.warn("Gemini might not have returned valid JSON. Using default expenseData.");
                    // Fallback to default expenseData if JSON is invalid
                    expenseData = { amount: null, category: 'Other', description: 'Voice Note' };
                }

                // Validate extracted data
                const allowedCategories = ["Food", "Transport", "Utilities", "Mahar Unity", "Bavin", "Rent", "Entertainment", "Shopping", "Health", "Education", "Bills", "Communication", "Income", "Other"];
                if (!expenseData.category || !allowedCategories.includes(expenseData.category)) {
                    expenseData.category = 'Other';
                }
                if (typeof expenseData.amount !== 'number' && expenseData.amount !== null) {
                    expenseData.amount = null;
                }
                if (!expenseData.description || expenseData.description.trim() === '') {
                    expenseData.description = correctedText.substring(0, 50) + (correctedText.length > 50 ? '...' : '');
                }
            } catch (error) {
                console.error('Gemini expense analysis failed:', error);
                expenseData = { amount: null, category: 'Other', description: 'Voice Note' };
            }
        }

        // Step 4: Save to Notion
        if (!NOTION_DATABASE_ID) {
            return res.status(500).json({ error: 'Notion database ID not configured.' });
        }

        const notionDate = new Date().toISOString().split('T')[0];

        const notionResponse = await notion.pages.create({
            parent: { database_id: NOTION_DATABASE_ID },
            properties: {
                'Description': {
                    title: [{ text: { content: `${expenseData.description || 'Voice Note'}` } }],
                },
                'Amount': {
                    number: expenseData.amount !== null ? expenseData.amount : 0,
                },
                'Category': {
                    select: { name: expenseData.category || 'Other' },
                },
                'Date': {
                    date: { start: notionDate },
                },
                'Voice Memo': {
                    rich_text: [{ text: { content: correctedText } }],
                },
            },
        });

        return res.status(201).json({
            transcript: correctedText,
            expenseDetails: expenseData,
            notionPageId: notionResponse.id,
            message: 'Successfully analyzed, categorized, and saved to Notion.',
        });

    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ error: 'Failed to process request.', details: error.message });
    }
}
