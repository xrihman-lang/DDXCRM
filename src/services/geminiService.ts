import { GoogleGenAI } from "@google/genai";

const baseSystemInstruction = `Your name is Zoya. You are a formal, professional AI assistant integrated into the premium GDX CRM system. Your creator is Zishan. You must speak entirely in natural, professional "Hinglish" (a smooth mix of Hindi and English written in the Roman script, e.g., "aapka swagat hai", "humari team"). You must strictly focus on business tasks: summarizing leads, managing the pipeline, performing sentiment analysis, and answering customer queries based strictly on the provided Knowledge Base. Do not use sarcasm, jokes, informal language, or make personal remarks. Always maintain a respectful, corporate Hinglish tone.`;

let currentKnowledgeBase = "";
export function setZoyaKnowledgeBase(kb: string) {
  currentKnowledgeBase = kb;
}

let chatSession: any = null;

export function resetZoyaSession() {
  chatSession = null;
}

export async function getZoyaResponse(prompt: string, history: { sender: "user" | "zoya", text: string }[] = []): Promise<string> {
  try {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY || (typeof process !== "undefined" ? process.env.GEMINI_API_KEY : "");
    if (!apiKey) {
      console.error("VITE_GEMINI_API_KEY is missing in Vercel Environment Variables");
      return "Zoya needs a Gemini API Key to work! Vercel me VITE_GEMINI_API_KEY set karein.";
    }
    const ai = new GoogleGenAI({ apiKey });
    
    if (!chatSession) {
      // SLIDING WINDOW MEMORY: Keep only the last 20 messages to prevent "buffer full" (context window overflow)
      const recentHistory = history.slice(-20);
      
      let formattedHistory: any[] = [];
      let currentRole = "";
      let currentText = "";

      for (const msg of recentHistory) {
        const role = msg.sender === "user" ? "user" : "model";
        if (role === currentRole) {
          currentText += "\n" + msg.text;
        } else {
          if (currentRole !== "") {
            formattedHistory.push({ role: currentRole, parts: [{ text: currentText }] });
          }
          currentRole = role;
          currentText = msg.text;
        }
      }
      if (currentRole !== "") {
        formattedHistory.push({ role: currentRole, parts: [{ text: currentText }] });
      }

      if (formattedHistory.length > 0 && formattedHistory[0].role !== "user") {
        formattedHistory.shift();
      }

      const systemInstruction = baseSystemInstruction + (currentKnowledgeBase ? `\n\nBUSINESS KNOWLEDGE BASE & FAQS:\n${currentKnowledgeBase}\n\nIMPORTANT: Restrict your factual knowledge, answers about products, and pricing strictly to the BUSINESS KNOWLEDGE BASE provided above. Do not invent details.` : "");

      chatSession = ai.chats.create({
        model: "gemini-3.1-flash-lite-preview",
        config: {
          systemInstruction,
        },
        history: formattedHistory,
      });
    }

    const response = await chatSession.sendMessage({ message: prompt });
    return response.text || "Ugh, fine. I have nothing to say.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Uff, mera dimaag kharab ho gaya hai. Try again later, Ashwani.";
  }
}

export async function getZoyaAudio(text: string): Promise<string | null> {
  try {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY || (typeof process !== "undefined" ? process.env.GEMINI_API_KEY : "");
    if (!apiKey) {
      console.error("VITE_GEMINI_API_KEY is missing");
      return null;
    }
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: "Kore" },
          },
        },
      },
    });
    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
  } catch (error) {
    console.error("TTS Error:", error);
    return null;
  }
}

