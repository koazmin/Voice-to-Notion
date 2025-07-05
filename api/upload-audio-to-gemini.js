// api/upload-audio-to-gemini.js
// This code should be placed in a file like `api/upload-audio-to-gemini.js` in your Vercel project's root.

// FIX: Remove FilesService from named import
import { GoogleGenerativeAI } from "@google/generative-ai"; 
import fetch from 'node-fetch';

// Ensure your environment variables are set in Vercel:
// GEMINI_API_KEY

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

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

        // FIX: Access Files API service via genAI.files
        const filesService = genAI.files; 

        if (!filesService) {
            console.error("genAI.files is undefined. This might indicate an issue with GEMINI_API_KEY or SDK initialization.");
            throw new Error("Gemini Files API service not available. Check API key and SDK version.");
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
