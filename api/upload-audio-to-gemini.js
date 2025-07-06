// api/upload-audio-to-gemini.js
// This code should be placed in a file like `api/upload-audio-to-gemini.js` in your Vercel project's root.

import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from 'node-fetch';
import { GoogleAuth } from 'google-auth-library';
import FormData from 'form-data'; // Import form-data library

// Ensure your environment variables are set in Vercel:
// GEMINI_API_KEY (Still needed for core model calls in other APIs)
// GCS_SERVICE_ACCOUNT_KEY (Crucial for this file's authentication)
// GCS_BUCKET_NAME (Used for fetching from GCS)

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY); // Still needed for genAI.files access if that path is used

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

        // Authenticate using Service Account for Files API
        const auth = new GoogleAuth({
            credentials: JSON.parse(process.env.GCS_SERVICE_ACCOUNT_KEY),
            scopes: ['https://www.googleapis.com/auth/cloud-platform'], // Scope for full Cloud Platform access
        });

        const authClient = await auth.getClient();
        const accessToken = (await authClient.getAccessToken()).token;

        const uploadFilesApiUrl = 'https://generativelanguage.googleapis.com/upload/v1beta/files?uploadType=multipart';
        
        // Refinement: Simplify displayName to a fixed prefix + timestamp
        const simpleDisplayName = `voice_note_${Date.now()}`;
        const uploadMetadata = {
            file: {
                displayName: simpleDisplayName,
            },
        };

        const formData = new FormData();
        formData.append('metadata', JSON.stringify(uploadMetadata), { contentType: 'application/json' });
        
        // Refinement: Ensure a consistent and simple filename for the binary part
        // Use a generic filename with the correct extension
        const fileExtension = mimeType.split('/')[1] || 'bin'; // e.g., 'webm', 'mp3'
        const filename = `audio.${fileExtension}`; // Simple filename like 'audio.webm'

        console.log(`Appending file part - filename: ${filename}, mimeType: ${mimeType}, size: ${audioBuffer.length} bytes`);
        formData.append('file', audioBuffer, { filename: filename, contentType: mimeType }); // Pass Buffer directly

        console.log("Sending multipart request to Gemini Files API...");

        const headers = {
            'Authorization': `Bearer ${accessToken}`,
            ...formData.getHeaders(), // This adds 'Content-Type: multipart/form-data; boundary=...'
        };

        const geminiUploadResponse = await fetch(uploadFilesApiUrl, {
            method: 'POST',
            headers: headers,
            body: formData,
        });

        if (!geminiUploadResponse.ok) {
            const errorBody = await geminiUploadResponse.text();
            console.error('Gemini Files API upload failed with status:', geminiUploadResponse.status, errorBody);
            throw new Error(`Gemini Files API upload failed: ${geminiUploadResponse.status} - ${errorBody}`);
        }

        const uploadResult = await geminiUploadResponse.json();
        const geminiFileUri = uploadResult.file.uri;
        const geminiFileName = uploadResult.file.name;

        console.log(`Audio uploaded to Gemini Files API. File URI: ${geminiFileUri}, Name: ${geminiFileName}`);

        res.status(200).json({ geminiFileUri: geminiFileUri, geminiFileName: geminiFileName });

    } catch (error) {
        console.error('Error uploading audio to Gemini Files API:', error);
        res.status(500).json({ 
            error: 'Failed to upload audio to Gemini Files API.', 
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
}
