import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import { GoogleGenAI, Modality } from "@google/genai";
import dotenv from "dotenv";
import { v2 as cloudinary } from 'cloudinary';
import db from './db.js';
import { createServer } from 'http';
import { Server } from 'socket.io';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" }
});

app.use(cors());
app.use(bodyParser.json({ limit: "10mb" }));

const ai = new GoogleGenAI({
  apiKey: process.env.GOOGLE_API_KEY,
});

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Realtime connection log
io.on("connection", (socket) => {
  console.log(" Realtime client connected");
});

app.get('/', (req, res) => {
  res.send('Hello from my Node.js server!');
});

app.post("/generate-image", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: "No prompt provided" });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash-preview-image-generation",
      contents: prompt,
      config: {
        responseModalities: [Modality.TEXT, Modality.IMAGE],
      },
    });

    const parts = response.candidates[0].content.parts;
    const imagePart = parts.find((p) => p.inlineData);

    if (imagePart) {
      const imageData = imagePart.inlineData.data;
      return res.json({ imageBase64: imageData });
    } else {
      return res.status(500).json({ error: "Image generation failed" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/publish-image", async (req, res) => {
  const { base64Image } = req.body;

  if (!base64Image) {
    return res.status(400).json({ error: "No image provided" });
  }

  try {
    const result = await cloudinary.uploader.upload(`data:image/png;base64,${base64Image}`, {
      folder: "gemini-images",
    });

    // Store in local DB
    await db.read();
    db.data.images ||= [];
    db.data.images.unshift(result.secure_url); // push to top
    await db.write();

    // Realtime update
    io.emit("new-image", result.secure_url);

    res.json({ url: result.secure_url });
  } catch (error) {
    console.error("Cloudinary upload failed:", error);
    res.status(500).json({ error: "Upload failed" });
  }
});

app.get("/list-images", async (req, res) => {
  try {
    await db.read();
    res.json({ images: db.data.images || [] });
  } catch (err) {
    console.error("Error listing images:", err);
    res.status(500).json({ error: "Failed to load images" });
  }
});

httpServer.listen(3000, () => {
  console.log(" Server running at http://localhost:3000");
});
