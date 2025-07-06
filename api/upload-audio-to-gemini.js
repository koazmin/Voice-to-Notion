// api/upload-audio-to-gemini.js
// This code should be placed in a file like `api/upload-audio-to-gemini.js` in your Vercel project's root.

// FIX: Import FilesService directly and remove GoogleGenerativeAI from this file
import { FilesService } from "@google/generative-ai"; 
import fetch from 'node-fetch';

// Ensure your environment variables are set in Vercel:
// GEMINI_API_KEY

// Note: genAI (GoogleGenerativeAI) instance is not needed in this specific file anymore
// as we are directly instantiating FilesService.
// It is still needed in transcribe-and-save.js, process-transcript.js, and ask-gemini.js.

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { publicHttpUrl, mimeType } = req.body;

    if (!publicHttpUrl || !mimeType) {
        return res.status(400).json({ error: 'publicHttpUrl and mimeType are required.' });
    }

    try {
        console.log(`Attempting to fetch audio from GCS: ${publicHttpUrl}`);
        const audioResponse = await fetch(publicHttpUrl);

        if (!audioResponse.ok) {
            const errorText = await audioResponse.text();
            console.error('Failed to fetch audio from GCS public URL:', audioResponse.status, errorText);
            throw new Error(`Failed to fetch audio from GCS (${audioResponse.status}): ${errorText}`);
        }

        const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
        
        console.log(`Fetched audio (${audioBuffer.length} bytes). Uploading to Gemini Files API...`);

        // FIX: Directly instantiate FilesService with the API key
        // This bypasses potential issues with genAI.files being undefined.
        const filesService = new FilesService(process.env.GEMINI_API_KEY); 

        // Additional check (should not be needed if instantiation above works, but for safety)
        if (!filesService) {
            console.error("CRITICAL: FilesService instantiation failed. Check GEMINI_API_KEY and SDK version.");
            throw new Error("Gemini Files API service not available after direct instantiation.");
        }

        const uploadResult = await filesService.uploadFile({ 
            file: audioBuffer,
            mimeType: mimeType,
            displayName: `voice-note-${Date.now()}`,
        });

        const geminiFile = uploadResult.file;
        console.log(`Audio uploaded to Gemini Files API. File URI: ${geminiFile.uri}, Name: ${geminiFile.name}`);

        res.status(200).json({ geminiFileUri: geminiFile.uri, geminiFileName: geminiFile.name });

    } catch (error) {
        console.error('Error uploading audio to Gemini Files API:', error);
        res.status(500).json({ 
            error: 'Failed to upload audio to Gemini Files API.', 
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
}
