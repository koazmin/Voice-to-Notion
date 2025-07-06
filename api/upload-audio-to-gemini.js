// api/upload-audio-to-gemini.js

import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from "node-fetch";

// Initialize Gemini with the correct environment variable
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { publicHttpUrl, mimeType } = req.body;

  if (!publicHttpUrl || !mimeType) {
    return res
      .status(400)
      .json({ error: "publicHttpUrl and mimeType are required." });
  }

  try {
    // Optional: Log key prefix for development only
    if (process.env.NODE_ENV === "development") {
      console.log(
        "Gemini Key (partial):",
        process.env.GOOGLE_GENERATIVE_AI_API_KEY?.slice(0, 8)
      );
    }

    console.log(`Fetching audio from URL: ${publicHttpUrl}`);
    const audioResponse = await fetch(publicHttpUrl);

    if (!audioResponse.ok) {
      const errorText = await audioResponse.text();
      console.error(
        "Failed to fetch audio:",
        audioResponse.status,
        errorText
      );
      throw new Error(`Failed to fetch audio (${audioResponse.status}): ${errorText}`);
    }

    const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
    console.log(`Audio fetched (${audioBuffer.length} bytes). Uploading...`);

    const filesService = genAI.files;

    if (!filesService) {
      console.error("genAI.files is undefined.");
      throw new Error(
        "Gemini Files API service not available. Check API key and SDK version."
      );
    }

    const uploadResult = await filesService.uploadFile({
      file: audioBuffer,
      mimeType: mimeType,
      displayName: `voice-note-${Date.now()}`,
    });

    const geminiFile = uploadResult.file;

    console.log(
      `Upload successful. URI: ${geminiFile.uri}, Name: ${geminiFile.name}`
    );

    res.status(200).json({
      geminiFileUri: geminiFile.uri,
      geminiFileName: geminiFile.name,
    });
  } catch (error) {
    console.error("Error uploading to Gemini:", error);
    res.status(500).json({
      error: "Failed to upload audio to Gemini Files API.",
      details: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
}
