// api/transcribe-and-save.js
// This code should be placed in a file like `api/transcribe-and-save.js` in your Vercel project's root.

import { GoogleGenerativeAI } from "@google/generative-ai";
import { Client as NotionClient } from "@notionhq/client";

// Ensure your environment variables are set in Vercel:
// GEMINI_API_KEY
// NOTION_API_KEY
// NOTION_DATABASE_ID

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const notion = new NotionClient({ auth: process.env.NOTION_API_KEY });
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { audio, mimeType, transcript } = req.body;
        let finalTranscript = transcript;

        if (audio && mimeType) {
            // If audio is provided, transcribe it
            const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

            // Prepare the audio part for Gemini
            const audioPart = {
                inlineData: {
                    data: audio,
                    mimeType: mimeType
                }
            };

            const prompt = "Transcribe the following Burmese audio."; // Specific prompt for Burmese
            const result = await model.generateContent([prompt, audioPart]);
            const response = result.response;
            finalTranscript = response.text();

            if (!finalTranscript) {
                return res.status(500).json({ error: 'Failed to get transcription from Gemini.' });
            }
        } else if (!transcript) {
            // If neither audio nor transcript is provided, it's an invalid request
            return res.status(400).json({ error: 'No audio or transcript provided for processing.' });
        }
        
        // At this point, finalTranscript holds either the newly transcribed text or the user-provided text.

        // Save to Notion
        if (!NOTION_DATABASE_ID) {
            console.error("NOTION_DATABASE_ID is not set.");
            return res.status(500).json({ error: 'Notion database ID is not configured on the server.' });
        }

        const date = new Date();
        const formattedDate = date.toLocaleString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        const pageTitle = `Voice Note - ${formattedDate}`;

        const notionResponse = await notion.pages.create({
            parent: {
                database_id: NOTION_DATABASE_ID,
            },
            properties: {
                // Assuming your Notion database has a 'Name' property of type 'Title'
                'Name': {
                    title: [
                        {
                            text: {
                                content: pageTitle,
                            },
                        },
                    ],
                },
                // You can add other properties here if your Notion database has them.
                // For example, a 'Content' rich_text property:
                'Content': { // Replace 'Content' with your actual property name in Notion
                    rich_text: [
                        {
                            text: {
                                content: finalTranscript,
                            },
                        },
                    ],
                },
            },
        });

        res.status(200).json({ 
            transcript: finalTranscript, 
            notionPageId: notionResponse.id,
            message: 'Successfully transcribed and saved to Notion.'
        });

    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ 
            error: 'Failed to process request.', 
            details: error.message 
        });
    }
}
