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
        // Initialize Google Cloud Storage with service account key
        // The GCS_SERVICE_ACCOUNT_KEY env var should contain the JSON string
        const serviceAccountKey = JSON.parse(process.env.GCS_SERVICE_ACCOUNT_KEY);

        const storage = new Storage({
            projectId: serviceAccountKey.project_id,
            credentials: {
                client_email: serviceAccountKey.client_email,
                private_key: serviceAccountKey.private_key.replace(/\\n/g, '\n'), // Replace escaped newlines
            },
        });

        const bucketName = process.env.GCS_BUCKET_NAME;
        const bucket = storage.bucket(bucketName);
        const file = bucket.file(fileName);

        // Generate a V4 signed URL for uploading (PUT method)
        const options = {
            version: 'v4',
            action: 'write', // allows upload
            expires: Date.now() + 15 * 60 * 1000, // URL expires in 15 minutes (adjust as needed)
            contentType: contentType,
        };

        const [signedUrl] = await file.getSignedUrl(options);

        // Construct the GCS URI that Gemini will use (gs://bucket-name/file-path)
        const gcsUri = `gs://${bucketName}/${fileName}`;

        console.log(`Generated signed URL for ${fileName}: ${signedUrl}`);

        res.status(200).json({ signedUrl, gcsUri });

    } catch (error) {
        console.error('Error generating signed URL:', error);
        res.status(500).json({ 
            error: 'Failed to generate signed URL for GCS upload.', 
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
}
