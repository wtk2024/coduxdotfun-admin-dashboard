import express from 'express';
import cors from 'cors';
import multer from 'multer';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Supabase with the MASTER key (service_role) to bypass RLS
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Setup Multer for memory storage
const upload = multer({ storage: multer.memoryStorage() });

// --- API ROUTES ---

// 1. Get all works
app.get('/api/works', async (req, res) => {
  try {
    const { data, error } = await supabase.from('works').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error("❌ Database Fetch Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// 2. Add a new work (with image upload)
app.post('/api/works', upload.single('thumbnail'), async (req, res) => {
  try {
    console.log("📥 Incoming project payload:", req.body);
    const { project_name, description, live_url, video_url } = req.body;
    let thumbnailUrl = null;

    if (!project_name || !description) {
      throw new Error("Project name and description are required.");
    }

    if (req.file) {
      console.log("🖼️ Uploading image to Supabase Storage...");
      const fileName = `${Date.now()}-${req.file.originalname.replace(/\s+/g, '-')}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('portfolio')
        .upload(fileName, req.file.buffer, {
          contentType: req.file.mimetype,
        });

      if (uploadError) {
        console.error("❌ Storage Upload Error:", uploadError);
        throw uploadError;
      }

      const { data: publicUrlData } = supabase.storage.from('portfolio').getPublicUrl(fileName);
      thumbnailUrl = publicUrlData.publicUrl;
      console.log("✅ Image uploaded. Public URL:", thumbnailUrl);
    }

    console.log("💾 Inserting record into Supabase Database...");
    const { data, error } = await supabase.from('works').insert([{
      project_name,
      description,
      live_url,
      video_url,
      thumbnail_url: thumbnailUrl
    }]).select();

    if (error) {
      console.error("❌ Database Insert Error:", error);
      throw error;
    }
    
    console.log("✅ Project deployed successfully!");
    res.status(201).json({ message: 'Project added successfully!', project: data[0] });

  } catch (error) {
    console.error("🚨 CRITICAL BACKEND ERROR:", error);
    res.status(500).json({ error: error.message || "An unknown error occurred" });
  }
});

// 3. Delete a work
app.delete('/api/works/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`🗑️ Deleting project with ID: ${id}`);
    
    const { error } = await supabase.from('works').delete().eq('id', id);
    if (error) {
      console.error("❌ Database Delete Error:", error);
      throw error;
    }
    
    console.log("✅ Project deleted.");
    res.json({ message: 'Project deleted successfully!' });
  } catch (error) {
    console.error("🚨 Delete Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Codux Backend running on http://localhost:${PORT}`);
});