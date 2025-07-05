// api/get-signed-url.js
// This code should be placed in a file like `api/get-signed-url.js` in your Vercel project's root.

import { Storage } from '@google-cloud/storage';

// Ensure your environment variables are set in Vercel:
// GCS_SERVICE_ACCOUNT_KEY (pasted JSON content of your service account key file)
// GCS_BUCKET_NAME (e.g., voice2note)

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { fileName, contentType } = req.body;

    if (!fileName || !contentType) {
        return res.status(400).json({ error: 'fileName and contentType are required.' });
    }

    try {
        const serviceAccountKey = JSON.parse(process.env.GCS_SERVICE_ACCOUNT_KEY);

        const storage = new Storage({
            projectId: serviceAccountKey.project_id,
            credentials: {
                client_email: serviceAccountKey.client_email,
                private_key: serviceAccountKey.private_key.replace(/\\n/g, '\n'),
            },
        });

        const bucketName = process.env.GCS_BUCKET_NAME;
        const bucket = storage.bucket(bucketName);
        const file = bucket.file(fileName);

        // Generate a V4 signed URL for uploading (PUT method)
        const options = {
            version: 'v4',
            action: 'write',
            expires: Date.now() + 15 * 60 * 1000, // URL expires in 15 minutes
            contentType: contentType,
        };

        const [signedUrl] = await file.getSignedUrl(options);

        // Construct the public HTTP URL for the GCS object
        // Format: https://storage.googleapis.com/BUCKET_NAME/OBJECT_NAME
        const publicHttpUrl = `https://storage.googleapis.com/${bucketName}/${fileName}`;

        console.log(`Generated signed URL for ${fileName}: ${signedUrl}`);
        console.log(`Generated public HTTP URL: ${publicHttpUrl}`);

        // Return both signedUrl (for client upload) and publicHttpUrl (for Gemini)
        res.status(200).json({ signedUrl, publicHttpUrl });

    } catch (error) {
        console.error('Error generating signed URL or public URL:', error);
        res.status(500).json({ 
            error: 'Failed to generate signed URL or public URL for GCS upload.', 
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
}
