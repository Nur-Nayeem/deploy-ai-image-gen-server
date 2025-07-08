import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import { GoogleGenAI, Modality } from "@google/genai";
import dotenv from "dotenv";
import { v2 as cloudinary } from 'cloudinary';
import { connectDB, Image } from './db.js'; // Import connectDB and Image model
import { createServer } from 'http';
import { Server } from 'socket.io';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" }
});

// Connect to MongoDB Atlas
connectDB();

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
  const { base64Image, prompt } = req.body; // Destructure prompt from req.body

  if (!base64Image) {
    return res.status(400).json({ error: "No image provided" });
  }
  // Add validation for prompt as well, if it's required
  if (!prompt) {
    return res.status(400).json({ error: "No prompt provided for publishing" });
  }

  try {
    const result = await cloudinary.uploader.upload(`data:image/png;base64,${base64Image}`, {
      folder: "gemini-images",
    });

    // Store in MongoDB Atlas, now including the prompt
    const newImage = new Image({ url: result.secure_url, prompt: prompt });
    await newImage.save();

    // Realtime update
    io.emit("new-image", { url: result.secure_url, prompt: prompt }); // Emit prompt with new image

    res.json({ url: result.secure_url, prompt: prompt });
  } catch (error) {
    console.error("Cloudinary upload or MongoDB save failed:", error);
    res.status(500).json({ error: "Upload failed" });
  }
});

app.get("/list-images", async (req, res) => {
  try {
    // Fetch images from MongoDB Atlas, sorted by creation date (newest first)
    // We now fetch both url and prompt
    const images = await Image.find().sort({ createdAt: -1 }).select('url prompt'); // Select specific fields
    res.json({ images: images }); // Return the full image objects (url and prompt)
  } catch (err) {
    console.error("Error listing images from MongoDB:", err);
    res.status(500).json({ error: "Failed to load images" });
  }
});

httpServer.listen(3000, () => {
  console.log(" Server running at http://localhost:3000");
});