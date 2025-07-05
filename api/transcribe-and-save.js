// api/transcribe-and-save.js
// This code should be placed in a file like `api/transcribe-and-save.js` in your Vercel project's root.

// FIX: Import FilesService directly for deletion
import { GoogleGenerativeAI, FilesService } from "@google/generative-ai"; 
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
        const { geminiFileUri, mimeType, transcript } = req.body; 
        let finalTranscript = transcript;

        console.log("transcribe-and-save.js received:", { geminiFileUri: geminiFileUri ? 'present' : 'absent', mimeType, transcript: transcript ? 'present' : 'absent' });

        const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" }); 

        if (geminiFileUri && mimeType) {
            console.log(`Received Gemini File URI for transcription: ${geminiFileUri} with mimeType: ${mimeType}`);

            const audioPart = {
                fileData: {
                    fileUri: geminiFileUri,
                    mimeType: mimeType
                }
            };

            const transcriptionPrompt = `Transcribe the following Burmese audio into accurate, natural-sounding text. Focus on correct spelling, grammar, and punctuation. Ensure the transcription reflects the spoken content precisely.`;
            
            console.log(`Sending Gemini File URI ${geminiFileUri} to Gemini for transcription...`);
            const result = await model.generateContent([transcriptionPrompt, audioPart]);
            const response = result.response;
            finalTranscript = response.text();

            // After successful transcription, it's good practice to delete the temporary file from Gemini Files API
            try {
                // FIX: Instantiate FilesService directly for deletion
                const filesService = new FilesService(process.env.GEMINI_API_KEY);
                await filesService.deleteFile(geminiFileUri); // Use filesService
                console.log(`Successfully deleted temporary Gemini file: ${geminiFileUri}`);
            } catch (deleteError) {
                console.warn(`Failed to delete temporary Gemini file ${geminiFileUri}:`, deleteError);
                // Don't block the main response for file deletion errors
            }

            if (!finalTranscript) {
                console.warn('Gemini returned an empty transcription. This could be due to unclear audio, unsupported format, or an issue with the model processing.');
                return res.status(500).json({ error: 'Failed to get transcription from Gemini. Audio might be unclear, too long, or an unsupported format.' });
            }
            console.log("Initial Gemini Transcription (Burmese):", finalTranscript);

        } else if (transcript) {
            console.log("Processing manually provided transcript for Notion saving.");
            finalTranscript = transcript;
        } else {
            console.error("Neither geminiFileUri/mimeType nor transcript was provided.");
            return res.status(400).json({ error: 'No audio or transcript provided for processing.' });
        }
        
        // --- Spell-checking and correction using Gemini AI ---
        let correctedText = finalTranscript;

        if (finalTranscript && finalTranscript.trim() !== '') {
            try {
                const correctionPrompt = `Review the following Burmese text for any spelling or punctuation errors. Also, ensure the text is natural and fluent for a native Burmese speaker. Provide only the corrected and polished Burmese text, without any additional comments, explanations, or introductory/concluding phrases.\n\nText to correct:\n${finalTranscript}`;
                
                console.log("Sending transcript to Gemini for spell/grammar correction with refined prompt...");
                const correctionResult = await model.generateContent(correctionPrompt);
                const correctionResponse = correctionResult.response;
                
                const rawCorrectedText = correctionResponse.text();

                if (rawCorrectedText.includes("Text to correct:") || rawCorrectedText.includes("Corrected text:") || rawCorrectedText.includes("Here is the corrected text:")) {
                    const lines = rawCorrectedText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
                    let potentialCorrectedLine = '';
                    for (let i = lines.length - 1; i >= 0; i--) {
                        if (!lines[i].includes("Text to correct:") && !lines[i].includes("Corrected text:") && !lines[i].includes("Here is the corrected text:")) {
                            potentialCorrectedLine = lines[i];
                            break;
                        }
                    }
                    correctedText = potentialCorrectedLine || rawCorrectedText;
                } else {
                    correctedText = rawCorrectedText;
                }

                console.log("Original Transcript:", finalTranscript);
                console.log("Corrected Text:", correctedText);

            } catch (correctionError) {
                console.error('Gemini spell correction failed:', correctionError);
                correctedText = finalTranscript; 
                console.warn('Proceeding with original transcript due to correction error.');
            }
        }

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
                'Name': {
                    title: [
                        {
                            text: {
                                content: pageTitle,
                            },
                        },
                    ],
                },
                'Content': {
                    rich_text: [
                        {
                            text: {
                                content: correctedText,
                            },
                        },
                    ],
                },
            },
        });

        console.log("Successfully saved to Notion. Page ID:", notionResponse.id);

        res.status(200).json({ 
            transcript: correctedText,
            notionPageId: notionResponse.id,
            message: 'Successfully transcribed, spell-checked, and saved to Notion.'
        });

    } catch (error) {
        console.error('API Error:', error);
        let errorMessage = 'Failed to process request.';
        if (error.message.includes('413')) {
            errorMessage = 'Audio file too large for direct upload. GCS upload might have failed.';
        } else if (error.message.includes('timeout')) {
            errorMessage = 'Processing timed out. This can happen with long recordings. Please increase Vercel function timeout.';
        } else if (error.message.includes('API key')) {
            errorMessage = 'Gemini API key is invalid or missing.';
        } else if (error.message.includes('Signed URL')) {
            errorMessage = `GCS signed URL error: ${error.message}`;
        } else if (error.message.includes('upload to GCS')) {
            errorMessage = `GCS upload failed: ${error.message}`;
        } else if (error.message.includes('Invalid or unsupported file uri') || error.message.includes('Failed to upload audio to Gemini Files API')) {
            errorMessage = `Gemini could not process the audio. Ensure bucket is public, URL is correct, and Gemini Files API upload succeeded.`;
        }
        res.status(500).json({ 
            error: errorMessage, 
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined 
        });
    }
}
