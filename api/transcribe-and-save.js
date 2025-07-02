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

        // Optimization 1: Using 'gemini-1.5-pro' for potentially higher accuracy.
        // While 'flash' models are faster, 'pro' models often offer better quality
        // for nuanced language tasks, especially for low-resource languages like Burmese.
        // Consider 'gemini-2.0-flash' if response speed is absolutely critical and you've
        // tested its accuracy for your specific audio types and found it sufficient.
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" }); 

        if (audio && mimeType) {
            const audioPart = {
                inlineData: {
                    data: audio,
                    mimeType: mimeType
                }
            };

            // Optimization 2: More specific and directive prompt for Burmese transcription.
            // This guides Gemini to prioritize accuracy, natural flow, and proper formatting.
            const transcriptionPrompt = `Transcribe the following Burmese audio into accurate, natural-sounding text. Focus on correct spelling, grammar, and punctuation. Ensure the transcription reflects the spoken content precisely.`;
            
            console.log("Sending audio to Gemini for transcription with enhanced prompt...");
            const result = await model.generateContent([transcriptionPrompt, audioPart]);
            const response = result.response;
            finalTranscript = response.text();

            if (!finalTranscript) {
                console.warn('Gemini returned an empty transcription. This could be due to unclear audio, unsupported format, or an issue with the model processing.');
                return res.status(500).json({ error: 'Failed to get transcription from Gemini. Audio might be unclear or unsupported.' });
            }
            console.log("Initial Gemini Transcription (Burmese):", finalTranscript);

        } else if (!transcript) {
            // If neither audio nor transcript is provided, it's an invalid request
            return res.status(400).json({ error: 'No audio or transcript provided for processing.' });
        }
        
        // --- Spell-checking and correction using Gemini AI ---
        let correctedText = finalTranscript; // Start with the raw transcript or user-provided text

        if (finalTranscript && finalTranscript.trim() !== '') {
            try {
                // Optimization 3: Refined prompt for correction.
                // This prompt emphasizes providing *only* the corrected text and aims for natural, fluent Burmese.
                // It now focuses on spelling and punctuation, and natural fluency, without explicitly mentioning grammar.
                const correctionPrompt = `Review the following Burmese text for any spelling or punctuation errors. Also, ensure the text is natural and fluent for a native Burmese speaker. Provide only the corrected and polished Burmese text, without any additional comments, explanations, or introductory/concluding phrases.\n\nText to correct:\n${finalTranscript}`;
                
                console.log("Sending transcript to Gemini for spell/grammar correction with refined prompt...");
                const correctionResult = await model.generateContent(correctionPrompt);
                const correctionResponse = correctionResult.response;
                
                const rawCorrectedText = correctionResponse.text();

                // Optimization 4: Basic post-processing to clean Gemini's correction output.
                // Sometimes, despite instructions, LLMs might add conversational filler.
                // This attempts to extract just the core corrected text.
                if (rawCorrectedText.includes("Text to correct:") || rawCorrectedText.includes("Corrected text:") || rawCorrectedText.includes("Here is the corrected text:")) {
                    const lines = rawCorrectedText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
                    let potentialCorrectedLine = '';
                    // Iterate from the end to find the most likely corrected text
                    for (let i = lines.length - 1; i >= 0; i--) {
                        if (!lines[i].includes("Text to correct:") && !lines[i].includes("Corrected text:") && !lines[i].includes("Here is the corrected text:")) {
                            potentialCorrectedLine = lines[i];
                            break;
                        }
                    }
                    correctedText = potentialCorrectedLine || rawCorrectedText; // Fallback to raw if extraction fails
                } else {
                    correctedText = rawCorrectedText;
                }

                console.log("Original Transcript:", finalTranscript);
                console.log("Corrected Text:", correctedText);

            } catch (correctionError) {
                console.error('Gemini spell correction failed:', correctionError);
                // In case of correction failure, proceed with the original transcript
                correctedText = finalTranscript; 
                console.warn('Proceeding with original transcript due to correction error.');
            }
        }
        // --- END Spell-checking ---

        // At this point, correctedText holds the transcribed/user-provided text, now spell-checked.

        // Save to Notion
        if (!NOTION_DATABASE_ID) {
            console.error("NOTION_DATABASE_ID is not set. Please configure your Vercel environment variables.");
            return res.status(500).json({ error: 'Notion database ID is not configured on the server.' });
        }

        const date = new Date();
        const formattedDate = date.toLocaleString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZoneName: 'short' 
        });
        
        const pageTitle = `Voice Note - ${formattedDate}`;

        console.log(`Attempting to save to Notion with title: "${pageTitle}" and content length: ${correctedText.length}`);

        const notionResponse = await notion.pages.create({
            parent: {
                database_id: NOTION_DATABASE_ID,
            },
            properties: {
                'Name': { // Ensure 'Name' is your title property in Notion
                    title: [
                        {
                            text: {
                                content: pageTitle,
                            },
                        },
                    ],
                },
                'Content': { // Replace 'Content' with your actual rich text property name in Notion
                    rich_text: [
                        {
                            text: {
                                content: correctedText, // Use the corrected text here
                            },
                        },
                    ],
                },
                // Optional: Add more properties if your Notion database has them
                // 'Language': {
                //     select: {
                //         name: 'Burmese', 
                //     },
                // },
                // 'Source': {
                //     select: {
                //         name: 'Voice Note App',
                //     },
                // },
            },
            // Important Note: Notion rich_text properties have character limits.
            // If 'correctedText' can be very long (e.g., thousands of characters),
            // you might need to split it into multiple blocks and append them to the page
            // using `notion.blocks.children.append` after the page creation.
            // For typical voice notes, the current approach for 'rich_text' property should suffice.
        });

        console.log("Successfully saved to Notion. Page ID:", notionResponse.id);

        res.status(200).json({ 
            transcript: correctedText, // Return the corrected text to the frontend
            notionPageId: notionResponse.id,
            message: 'Successfully transcribed, spell-checked, and saved to Notion.'
        });

    } catch (error) {
        console.error('API Error:', error);
        // In a production environment, avoid exposing full error stack traces to clients.
        // This example shows it for development/debugging purposes.
        res.status(500).json({ 
            error: 'Failed to process request.', 
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined 
        });
    }
}
