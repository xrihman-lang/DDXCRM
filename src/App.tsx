import React, { useState, useEffect, useRef, useCallback } from "react";
import { Mic, MicOff, Loader2, Volume2, VolumeX, Keyboard, Send, Trash2, LayoutDashboard, Users, BarChart3, Settings, LogOut, Search, Bell, MessageSquare, X } from "lucide-react";
import { getZoyaResponse, getZoyaAudio, resetZoyaSession, setZoyaKnowledgeBase } from "./services/geminiService";
import { processCommand } from "./services/commandService";
import { LiveSessionManager, setLiveZoyaKnowledgeBase } from "./services/liveService";
import Visualizer from "./components/Visualizer";
import PermissionModal from "./components/PermissionModal";
import { playPCM } from "./utils/audioUtils";
import { motion, AnimatePresence } from "motion/react";
import { signInWithPopup, signOut, onAuthStateChanged, User } from "firebase/auth";
import { auth, googleProvider } from "./firebase";

type AppState = "idle" | "listening" | "processing" | "speaking";

interface ChatMessage {
  id: string;
  sender: "user" | "zoya";
  text: string;
}

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(() => localStorage.getItem("gdx_auth") === "true");
  const [activeTab, setActiveTab] = useState<"dashboard" | "shared_inbox" | "leads" | "settings">("dashboard");
  const [knowledgeBase, setKnowledgeBase] = useState(() => localStorage.getItem("gdx_knowledge_base") || "");
  const [backendUrl, setBackendUrl] = useState(() => localStorage.getItem("gdx_backend_url") || "");
  const [instanceId, setInstanceId] = useState(() => localStorage.getItem("gdx_instance_id") || "");
  const [accessToken, setAccessToken] = useState(() => localStorage.getItem("gdx_access_token") || "");
  const [isSavedReassure, setIsSavedReassure] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [selectedLead, setSelectedLead] = useState<any>(null);
  
  const [simMessages, setSimMessages] = useState<{id: string, sender: 'customer' | 'bot', text: string}[]>([]);
  const [simInput, setSimInput] = useState("");

  const LEADS = [
    { name: "Acme Corp", contact: "sarah@acme.co", status: "🔥 Hot Lead", amount: "₹1,20,000", agent: "ZS", agentName: "Zishan", messages: [{sender:"user", text:"Can we get a discount?"},{sender:"zoya", text:"Let me check current promos... \n\n— Sent via GDX Automation"}] },
    { name: "Nexus Industries", contact: "alex@nexus.net", status: "Proposal Sent", amount: "₹65,000", agent: "ZY", agentName: "Zoya AI", messages: [] },
    { name: "Starlite Media", contact: "emily@starlite.tv", status: "Contacted", amount: "₹12,500", agent: "ZS", agentName: "Zishan", messages: [] },
    { name: "Quantum Data", contact: "michael@qdata.ai", status: "🔥 Hot Lead", amount: "₹2,10,000", agent: "ZY", agentName: "Zoya AI", messages: [] },
  ];

  useEffect(() => {
    localStorage.setItem("gdx_knowledge_base", knowledgeBase);
    localStorage.setItem("gdx_backend_url", backendUrl);
    localStorage.setItem("gdx_instance_id", instanceId);
    localStorage.setItem("gdx_access_token", accessToken);
    setZoyaKnowledgeBase(knowledgeBase);
    setLiveZoyaKnowledgeBase(knowledgeBase);
  }, [knowledgeBase, backendUrl, instanceId, accessToken]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthenticated(!!currentUser);
      if (currentUser) {
        localStorage.setItem("gdx_auth", "true");
      } else {
        localStorage.removeItem("gdx_auth");
      }
    });
    return () => unsubscribe();
  }, []);

  const handleGoogleSignIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      console.error("Error signing in with Google", error);
      if (error.code === 'auth/unauthorized-domain') {
        alert(`Please add this domain to your Firebase Authorized Domains list:\n\n${window.location.hostname}\n\nGo to Firebase Console -> Authentication -> Settings -> Authorized domains`);
      }
    }
  };

  const handleSaveConfig = async () => {
    setIsSavedReassure(true);
    if(saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => setIsSavedReassure(false), 3000);

    if (backendUrl && instanceId && accessToken) {
      try {
        const targetUrl = backendUrl.endsWith('/') ? backendUrl.slice(0, -1) : backendUrl;
        await fetch(`${targetUrl}/api/tokens/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instanceId, accessToken, knowledgeBase })
        });
      } catch (err) {
        console.error("Failed to sync config with Render backend", err);
      }
    }
  };

  const [showQRModal, setShowQRModal] = useState(false);

  const handleSimulatorSend = async () => {
    if(!simInput.trim()) return;
    const newMsg = {id: Date.now().toString(), sender: 'customer' as const, text: simInput};
    setSimMessages(prev => [...prev, newMsg]);
    setSimInput("");
    
    const maxHistory = simMessages.map(m => ({
       sender: (m.sender === 'customer' ? 'user' : 'zoya') as 'user' | 'zoya',
       text: m.text
    }));
    
    // Slight artificial delay to simulate typing
    await new Promise(r => setTimeout(r, 600));

    setAppState('processing');
    const reply = await getZoyaResponse(simInput, maxHistory);
    const watermarkReply = reply + "\n\n— Sent via GDX Automation";
    
    setSimMessages(prev => [...prev, {id: Date.now().toString()+"-bot", sender: 'bot', text: watermarkReply}]);
    setAppState('idle');
  };

  const handleQuickReply = async (template: string) => {
    setAppState('processing');
    
    const prompt = `Customize this quick-reply template: "${template}" for our lead. The current customer is "Customer #442" who is interested in our services. Draft a polite, professional Hinglish response based on our Knowledge Base. Deliver only the final message.`;
    
    const maxHistory = simMessages.map(m => ({
       sender: (m.sender === 'customer' ? 'user' : 'zoya') as 'user' | 'zoya',
       text: m.text
    }));

    const reply = await getZoyaResponse(prompt, maxHistory);
    const watermarkReply = reply + "\n\n— Sent via GDX Automation";
    
    setSimMessages(prev => [...prev, {id: Date.now().toString()+"-bot", sender: 'bot', text: watermarkReply}]);
    setAppState('idle');
  };

  const [appState, setAppState] = useState<AppState>("idle");
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const saved = localStorage.getItem("gdx_zoya_chat_history");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.length > 0) return parsed;
      } catch (e) {
        console.error("Failed to parse chat history", e);
      }
    }
    return [{
      id: "init",
      sender: "zoya",
      text: "GDX CRM mein aapka swagat hai! Main aapka AI assistant hoon. Main aapke leads manage karne, sales pipeline track karne aur customer queries ka jawab dene mein help karunga. Aaj main aapki kya madad kar sakta hoon?\n\n— Sent via GDX Automation"
    }];
  });
  const messagesRef = useRef(messages);

  useEffect(() => {
    messagesRef.current = messages;
    localStorage.setItem("gdx_zoya_chat_history", JSON.stringify(messages));
  }, [messages]);

  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    if (liveSessionRef.current) {
      liveSessionRef.current.isMuted = isMuted;
    }
  }, [isMuted]);

  const [showTextInput, setShowTextInput] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [isSessionActive, setIsSessionActive] = useState(false);

  const liveSessionRef = useRef<LiveSessionManager | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, appState, simMessages]);

  const appendWatermark = (text: string) => text + "\n\n— Sent via GDX Automation";

  const handleTextCommand = useCallback(async (finalTranscript: string) => {
    if (!finalTranscript.trim()) {
      setAppState("idle");
      return;
    }

    setMessages((prev) => [...prev, { id: Date.now().toString(), sender: "user", text: finalTranscript }]);
    
    if (isSessionActive && liveSessionRef.current) {
      liveSessionRef.current.sendText(finalTranscript);
      return;
    }

    setAppState("processing");

    const commandResult = processCommand(finalTranscript);
    let responseText = "";

    if (commandResult.isBrowserAction) {
      responseText = commandResult.action;
      const watermarkText = appendWatermark(responseText);
      setMessages((prev) => [...prev, { id: Date.now().toString() + "-z", sender: "zoya", text: watermarkText }]);
      
      if (!isMuted) {
        setAppState("speaking");
        const audioBase64 = await getZoyaAudio(responseText); // Don't speak watermark
        if (audioBase64) {
          await playPCM(audioBase64);
        }
      }

      setAppState("idle");
      setTimeout(() => {
        if (commandResult.url) {
          window.open(commandResult.url, "_blank");
        }
      }, 1500);
    } else {
      responseText = await getZoyaResponse(finalTranscript, messagesRef.current);
      const watermarkText = appendWatermark(responseText);
      setMessages((prev) => [...prev, { id: Date.now().toString() + "-z", sender: "zoya", text: watermarkText }]);
      
      if (!isMuted) {
        setAppState("speaking");
        const audioBase64 = await getZoyaAudio(responseText); // Don't speak watermark
        if (audioBase64) {
          await playPCM(audioBase64);
        }
      }
      setAppState("idle");
    }
  }, [isMuted, isSessionActive]);

  useEffect(() => {
    return () => {
      if (liveSessionRef.current) {
        liveSessionRef.current.stop();
      }
    };
  }, []);

  const toggleListening = async () => {
    if (isSessionActive) {
      setIsSessionActive(false);
      if (liveSessionRef.current) {
        liveSessionRef.current.stop();
        liveSessionRef.current = null;
      }
      setAppState("idle");
      resetZoyaSession();
    } else {
      try {
        setIsSessionActive(true);
        resetZoyaSession();
        
        const session = new LiveSessionManager();
        session.isMuted = isMuted;
        liveSessionRef.current = session;
        
        session.onStateChange = (state) => {
          setAppState(state);
        };
        
        session.onMessage = (sender, text) => {
           // If Zoya, append watermark
           const modifiedText = sender === "zoya" ? appendWatermark(text) : text;
           setMessages((prev) => [...prev, { id: Date.now().toString() + "-" + sender, sender, text: modifiedText }]);
        };
        
        session.onCommand = (url) => {
          setTimeout(() => {
            window.open(url, "_blank");
          }, 1000);
        };

        await session.start();
      } catch (e) {
        console.error("Failed to start session", e);
        setShowPermissionModal(true);
        setIsSessionActive(false);
        setAppState("idle");
      }
    }
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim()) return;
    
    handleTextCommand(textInput);
    setTextInput("");
    setShowTextInput(false);
  };

  if (!isAuthenticated) {
    return (
      <div className="h-[100dvh] w-screen bg-[#050505] text-white flex items-center justify-center font-sans tracking-wide relative overflow-hidden">
        {/* Cinematic Background Gradients */}
        <div className="absolute top-[10%] left-[20%] w-[40%] h-[40%] bg-cyan-900/20 blur-[120px] rounded-full pointer-events-none" />
        <div className="absolute bottom-[10%] right-[20%] w-[40%] h-[40%] bg-violet-900/20 blur-[120px] rounded-full pointer-events-none" />
        
        <div className="bg-black/60 backdrop-blur-xl border border-white/10 p-10 rounded-3xl w-full max-w-md shadow-2xl relative z-10 mx-4">
            <div className="text-center mb-8">
                <div className="w-14 h-14 bg-cyan-500 rounded-2xl flex items-center justify-center text-black font-bold text-xl tracking-tighter mx-auto mb-4 shadow-[0_0_20px_rgba(6,182,212,0.4)]">
                    GDX
                </div>
                <h1 className="text-2xl font-semibold mb-1 text-white">Welcome Back</h1>
                <p className="text-sm text-white/50">Enter your credentials to access the CRM</p>
            </div>
            
            <div className="flex flex-col gap-4">
                <button 
                    onClick={handleGoogleSignIn}
                    className="w-full bg-white text-black font-semibold shadow-[0_0_15px_rgba(255,255,255,0.2)] rounded-xl p-3.5 hover:bg-gray-200 transition-all tracking-wide flex items-center justify-center gap-3">
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                        <path d="M1 1h22v22H1z" fill="none"/>
                    </svg>
                    Continue with Google
                </button>
            </div>
            
            <div className="mt-6 text-center">
                <p className="text-xs text-white/30 uppercase tracking-widest">Global Data Exchange</p>
            </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] w-screen bg-[#050505] text-white flex font-sans relative overflow-hidden m-0 p-0">
      {showPermissionModal && (
        <PermissionModal 
          onClose={() => setShowPermissionModal(false)} 
        />
      )}

      {/* QR Code Modal for WhatsApp */}
      <AnimatePresence>
        {showQRModal && (
          <motion.div 
             initial={{ opacity: 0 }}
             animate={{ opacity: 1 }}
             exit={{ opacity: 0 }}
             className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm"
          >
             <motion.div 
                initial={{ scale: 0.95 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.95 }}
                className="bg-[#111b21] border border-white/10 rounded-3xl p-10 max-w-md w-full mx-4 flex flex-col items-center justify-center shadow-[0_20px_60px_rgba(0,0,0,0.8),0_0_40px_rgba(37,211,102,0.1)] relative"
             >
                <button onClick={() => setShowQRModal(false)} className="absolute top-6 right-6 text-white/50 hover:text-white transition-colors p-2 bg-white/5 rounded-full hover:bg-white/10">
                   <X size={20} />
                </button>
                <div className="text-center mb-8 w-full">
                   <h3 className="text-2xl font-semibold text-white mb-2">Connect WhatsApp</h3>
                   <p className="text-sm text-white/50">Scan this QR code with your WhatsApp app to instantly link your number to GDX CRM.</p>
                </div>
                
                <div className="relative mx-auto w-64 h-64 flex items-center justify-center mb-8">
                   {/* Spinning subtle loader ring */}
                   <div className="absolute inset-0 rounded-2xl border-4 border-white/5" />
                   <div className="absolute inset-0 rounded-2xl border-4 border-[#25D366] border-t-transparent animate-spin" style={{ animationDuration: '3s' }} />
                   
                   {/* Clean QR Mockup */}
                   <div className="bg-white p-3 rounded-xl flex items-center justify-center w-56 h-56 shadow-inner z-10">
                      <svg viewBox="0 0 100 100" className="w-full h-full" fill="#111b21">
                         {/* Top Left Eye */}
                         <path d="M5,5 h25 v25 h-25 z M10,10 h15 v15 h-15 z" fillRule="evenodd" />
                         <rect x="13" y="13" width="9" height="9" />
                         {/* Top Right Eye */}
                         <path d="M70,5 h25 v25 h-25 z M75,10 h15 v15 h-15 z" fillRule="evenodd" />
                         <rect x="78" y="13" width="9" height="9" />
                         {/* Bottom Left Eye */}
                         <path d="M5,70 h25 v25 h-25 z M10,75 h15 v15 h-15 z" fillRule="evenodd" />
                         <rect x="13" y="78" width="9" height="9" />
                         {/* Faux Data Blocks */}
                         <rect x="35" y="5" width="30" height="5" />
                         <rect x="40" y="15" width="25" height="5" />
                         <rect x="35" y="25" width="10" height="5" />
                         <rect x="50" y="25" width="15" height="5" />
                         <rect x="5" y="35" width="90" height="5" />
                         <rect x="15" y="45" width="15" height="15" />
                         <rect x="35" y="45" width="25" height="10" />
                         <rect x="65" y="45" width="30" height="5" />
                         <rect x="45" y="60" width="50" height="5" />
                         <rect x="5" y="60" width="15" height="5" />
                         <rect x="35" y="75" width="25" height="20" />
                         <rect x="65" y="75" width="30" height="5" />
                         <rect x="65" y="85" width="15" height="10" />
                         <rect x="85" y="85" width="10" height="10" />
                         <rect x="25" y="45" width="5" height="20" />
                         <rect x="5" y="45" width="5" height="10" />
                      </svg>
                   </div>
                </div>

                <div className="flex flex-col items-center justify-center gap-3">
                   <div className="flex items-center gap-2">
                       <Loader2 size={16} className="text-[#25D366] animate-spin" />
                       <p className="text-center text-sm text-[#25D366] font-medium tracking-wide">Waiting for scan...</p>
                   </div>
                   <p className="text-xs text-white/40 text-center max-w-[250px]">Make sure your phone is connected to the internet.</p>
                </div>
             </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cinematic Background Gradients */}
      <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-cyan-900/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-violet-900/10 blur-[120px] rounded-full" />
      </div>

      {/* Sidebar */}
      <aside className="w-64 border-r border-white/10 bg-black/40 backdrop-blur-xl flex flex-col z-10 shrink-0">
        <div className="p-6 border-b border-white/10 flex flex-col items-start">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 bg-cyan-500 rounded-lg flex items-center justify-center font-bold tracking-tighter text-black shadow-[0_0_15px_rgba(6,182,212,0.6)]">
              GDX
            </div>
            <h1 className="text-xl font-bold tracking-widest text-cyan-400">CRM</h1>
          </div>
          <p className="text-[10px] text-white/40 tracking-widest uppercase">Premium Edition</p>
        </div>

        <nav className="flex-1 p-4 flex flex-col gap-2">
          <button 
            onClick={() => setActiveTab("dashboard")}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'dashboard' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' : 'hover:bg-white/5 text-white/70 hover:text-white border border-transparent'}`}
          >
            <LayoutDashboard size={18} />
            <span className="font-medium text-sm">Dashboard</span>
          </button>
          <button 
            onClick={() => setActiveTab("shared_inbox")}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'shared_inbox' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' : 'hover:bg-white/5 text-white/70 hover:text-white border border-transparent'}`}
          >
            <MessageSquare size={18} />
            <span className="font-medium text-sm">Shared Inbox</span>
          </button>
          <button 
            onClick={() => setActiveTab("leads")}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'leads' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' : 'hover:bg-white/5 text-white/70 hover:text-white border border-transparent'}`}
          >
            <Users size={18} />
            <span className="font-medium text-sm">Leads</span>
          </button>
          <button 
            onClick={() => setActiveTab("settings")}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'settings' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' : 'hover:bg-white/5 text-white/70 hover:text-white border border-transparent'}`}
          >
            <Settings size={18} />
            <span className="font-medium text-sm">Settings</span>
          </button>

          <div className="mt-auto pt-6">
             <div className="bg-black/80 backdrop-blur-xl border border-cyan-500/30 rounded-2xl p-4 flex flex-col gap-4 shadow-[0_10px_40px_rgba(0,0,0,0.5),0_0_20px_rgba(6,182,212,0.15)] relative">
                <div className="flex items-center gap-3">
                   <div className="w-12 h-12 relative rounded-full overflow-hidden bg-black flex items-center justify-center shrink-0 border border-white/5">
                     <div className="w-[400px] h-[400px] absolute flex items-center justify-center" style={{ transform: 'scale(0.12)' }}>
                        <Visualizer state={appState} />
                     </div>
                     <div className="absolute bottom-0.5 right-0.5 w-2 h-2 rounded-full shadow-[0_0_5px_rgba(0,0,0,1)] z-10 flex items-center justify-center">
                         {appState === "listening" && <div className="w-full h-full bg-red-500 rounded-full animate-pulse" />}
                         {appState === "processing" && <div className="w-full h-full bg-cyan-400 rounded-full animate-pulse" />}
                         {appState === "speaking" && <div className="w-full h-full bg-pink-500 rounded-full animate-pulse" />}
                     </div>
                   </div>
                   <div className="flex flex-col">
                      <span className="text-sm font-medium text-white">Zoya AI</span>
                      <span className="text-[10px] text-cyan-400">Voice Assistant</span>
                   </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleListening}
                    className={`flex-1 flex justify-center items-center gap-2 py-2 rounded-xl text-xs font-semibold tracking-wide transition-all uppercase ${
                      isSessionActive 
                        ? "bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30" 
                        : "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/30"
                    }`}
                  >
                    {isSessionActive ? (
                      <><MicOff size={14} /> Stop</>
                    ) : (
                      <><Mic size={14} /> Voice</>
                    )}
                  </button>
                  <button
                    onClick={() => setShowTextInput(!showTextInput)}
                    className={`p-2 rounded-xl transition-colors ${showTextInput ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'bg-white/5 border border-white/10 hover:bg-white/10 text-white/70 hover:text-white'}`}
                    title="Text Chat"
                  >
                    <Keyboard size={14} />
                  </button>
                  <button
                    onClick={() => setIsMuted(!isMuted)}
                    className="p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-white/70 hover:text-white"
                    title={isMuted ? "Unmute Zoya" : "Mute Zoya"}
                  >
                    {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                  </button>
                </div>

                <AnimatePresence>
                  {showTextInput && (
                    <motion.form 
                      initial={{ opacity: 0, height: 0, marginTop: 0 }}
                      animate={{ opacity: 1, height: 'auto', marginTop: 8 }}
                      exit={{ opacity: 0, height: 0, marginTop: 0 }}
                      onSubmit={handleTextSubmit}
                      className="flex items-center gap-2 bg-black/50 border border-cyan-500/30 rounded-xl p-1 pl-3 overflow-hidden"
                    >
                      <input 
                        type="text"
                        value={textInput}
                        onChange={(e) => setTextInput(e.target.value)}
                        placeholder="Ask Zoya..."
                        className="w-full bg-transparent border-none outline-none text-white placeholder:text-white/40 text-[11px] font-medium"
                        autoFocus
                      />
                      <button 
                        type="submit"
                        disabled={!textInput.trim()}
                        className="p-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-black transition-colors"
                      >
                        <Send size={12} />
                      </button>
                    </motion.form>
                  )}
                </AnimatePresence>
             </div>
          </div>
        </nav>

        <div className="p-6 border-t border-white/10 flex flex-col gap-3">
          <div className="text-[10px] text-white/40 tracking-widest uppercase space-y-1">
            <p>Created by Zishan</p>
            <p className="text-cyan-500/70 font-bold">Powered by GDX Automation</p>
          </div>
          <button onClick={async () => {
            try {
              await signOut(auth);
            } catch (err) {
              console.error(err);
            }
            localStorage.removeItem("gdx_auth");
            setIsAuthenticated(false);
          }} className="flex items-center gap-3 px-4 py-2 mt-4 rounded-xl hover:bg-red-500/10 text-white/50 hover:text-red-400 transition-all text-sm w-full text-left">
            <LogOut size={16} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Container */}
      <main className="flex-1 flex flex-col z-10 relative overflow-hidden">
        {/* Header */}
        <header className="h-20 border-b border-white/10 bg-black/20 backdrop-blur-md flex items-center justify-between px-8 shrink-0">
          <h2 className="text-xl font-medium tracking-wide">
            {activeTab === 'dashboard' && 'Dashboard Overview'}
            {activeTab === 'shared_inbox' && 'Shared Inbox / Simulations'}
            {activeTab === 'leads' && 'Active Leads'}
            {activeTab === 'settings' && 'System Settings'}
          </h2>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-2">
              <Search size={16} className="text-white/40" />
              <input 
                type="text" 
                placeholder="Search CRM..." 
                className="bg-transparent border-none outline-none text-sm text-white placeholder:text-white/30 w-48"
              />
            </div>
            <button className="relative p-2 text-white/70 hover:text-white transition-colors">
              <Bell size={20} />
              <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,1)]" />
            </button>
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-cyan-600 to-blue-800 border border-white/10" />
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar relative">
          
          {activeTab === 'settings' && (
            <div className="p-8 font-sans max-w-4xl">
               <h2 className="text-2xl font-semibold mb-6">GDX System Settings</h2>
               <div className="bg-black/40 border border-white/10 rounded-3xl p-8 backdrop-blur-md">
                  <h3 className="text-lg font-medium mb-2 text-cyan-400">Business Knowledge Base & FAQs</h3>
                  <p className="text-sm text-white/50 mb-6">Paste products, pricing, and company rules here. The Zoya AI will restrict its knowledge strictly to this text when answering customer inquiries.</p>
                  <textarea 
                      value={knowledgeBase}
                      onChange={(e) => setKnowledgeBase(e.target.value)}
                      className="w-full h-80 bg-black/50 border border-white/10 rounded-xl p-4 text-white placeholder:text-white/30 outline-none focus:border-cyan-500/50 transition-colors custom-scrollbar"
                      placeholder="e.g., Our flagship product is GDX Pro priced at $99/mo. We do not offer refunds..."  
                  />
                  <div className="mt-4 flex flex-wrap items-center gap-4">
                     <button
                        onClick={handleSaveConfig}
                        className={`px-6 py-2.5 font-semibold tracking-wide rounded-lg transition-colors flex items-center gap-2 ${
                           isSavedReassure 
                              ? "bg-[#25D366]/20 text-[#25D366] border border-[#25D366]/50 shadow-[0_0_15px_rgba(37,211,102,0.1)]" 
                              : "bg-cyan-600/20 text-cyan-400 border border-cyan-500/50 hover:bg-cyan-600/30 shadow-[0_0_15px_rgba(6,182,212,0.1)]"
                        }`}
                     >
                        {isSavedReassure ? "✓ Configuration Saved Alive!" : "💾 Save Configuration"}
                     </button>
                  </div>
               </div>

               <div className="bg-black/40 border border-white/10 rounded-3xl p-8 backdrop-blur-md mt-6">
                  <h3 className="text-lg font-medium mb-6 text-cyan-400">🔌 WhatsApp Gateway Integration</h3>
                  <div className="space-y-4">
                     <div className="flex flex-col gap-1.5">
                        <label className="text-sm text-white/70">WhatsApp Instance ID</label>
                        <input type="text" value={instanceId} onChange={(e) => setInstanceId(e.target.value)} className="w-full bg-black/50 border border-white/10 rounded-xl p-3 text-white placeholder:text-white/30 outline-none focus:border-cyan-500/50 transition-colors" placeholder="e.g., inst_65892ac" />
                     </div>
                     <div className="flex flex-col gap-1.5">
                        <label className="text-sm text-white/70">Access Token / API Key</label>
                        <input type="password" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} className="w-full bg-black/50 border border-white/10 rounded-xl p-3 text-white placeholder:text-white/30 outline-none focus:border-cyan-500/50 transition-colors" placeholder="Enter your gateway token here" />
                     </div>
                     <div className="flex flex-col gap-1.5">
                        <label className="text-sm text-white/70">Webhook URL</label>
                        <input type="text" readOnly value="https://api.gdx-crm.com/v1/webhook" className="w-full bg-black/50 border border-white/10 rounded-xl p-3 text-white/50 outline-none cursor-not-allowed" />
                     </div>
                     <button onClick={() => setShowQRModal(true)} className="mt-4 px-6 py-3 bg-[#25D366]/20 text-[#25D366] border border-[#25D366]/30 font-semibold rounded-xl hover:bg-[#25D366]/30 transition-colors flex items-center justify-center gap-2 w-full md:w-auto">
                        <span>⚡</span>
                        Connect WhatsApp (Scan QR Code)
                     </button>
                  </div>
               </div>

               <div className="bg-black/40 border border-white/10 rounded-3xl p-8 backdrop-blur-md mt-6">
                  <h3 className="text-lg font-medium mb-4 text-cyan-400">🌐 API & Engine Settings</h3>
                  <div className="space-y-4">
                     <div className="flex flex-col gap-1.5">
                        <label className="text-sm text-white/70">Backend Server Base URL</label>
                        <input type="text" value={backendUrl} onChange={(e) => setBackendUrl(e.target.value)} className="w-full bg-black/50 border border-white/10 rounded-xl p-3 text-white placeholder:text-white/30 outline-none focus:border-cyan-500/50 transition-colors" placeholder="https://your-app.onrender.com" />
                     </div>
                  </div>
               </div>

               <div className="bg-black/40 border border-white/10 rounded-3xl p-8 backdrop-blur-md mt-6">
                  <h3 className="text-lg font-medium mb-4 text-cyan-400">⚖️ Legal & Compliance</h3>
                  
                  <div className="space-y-6 text-sm text-white/80">
                     <div className="bg-black/30 p-5 rounded-2xl border border-white/5">
                        <h4 className="text-white font-medium mb-3 text-base flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span> Privacy Policy</h4>
                        <ul className="list-none space-y-3">
                           <li className="pl-4 border-l-2 border-white/10 leading-relaxed"><strong className="text-white font-medium">Data Collection:</strong> We securely store user-provided Meta Access Tokens, Phone Number IDs, and Business Knowledge Base data solely to process automated WhatsApp responses via Google Gemini API.</li>
                           <li className="pl-4 border-l-2 border-white/10 leading-relaxed"><strong className="text-white font-medium">Data Protection:</strong> No chat logs, customer phone numbers, or private tokens are shared, sold, or exposed to third parties. All API communications are encrypted.</li>
                        </ul>
                     </div>

                     <div className="bg-black/30 p-5 rounded-2xl border border-white/5">
                        <h4 className="text-white font-medium mb-3 text-base flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span> Terms of Service & Usage Policy</h4>
                        <ul className="list-none space-y-3">
                           <li className="pl-4 border-l-2 border-white/10 leading-relaxed"><strong className="text-white font-medium">Compliance:</strong> Users must comply with Meta's Official WhatsApp Business Policy. Any misuse, spamming, or sending unauthorized bulk messages that leads to number suspension is the sole responsibility of the user. GDX Automation will not be liable for account bans.</li>
                           <li className="pl-4 border-l-2 border-white/10 leading-relaxed"><strong className="text-white font-medium">API Fair Use:</strong> Users must provide valid Google Gemini and Meta API credentials.</li>
                        </ul>
                     </div>

                     <div className="bg-black/30 p-5 rounded-2xl border border-white/5">
                        <h4 className="text-white font-medium mb-3 text-base flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span> Payment & Refund Policy (Upcoming Integration)</h4>
                        <ul className="list-none space-y-3">
                           <li className="pl-4 border-l-2 border-white/10 leading-relaxed"><strong className="text-white font-medium">Subscription Model:</strong> The service will operate on a monthly/annual prepaid subscription basis (Basic at ₹5,000/mo and Premium at ₹15,000/mo).</li>
                           <li className="pl-4 border-l-2 border-white/10 leading-relaxed"><strong className="text-white font-medium">Cancellation:</strong> Users can cancel their subscription at any time from their profile billing section.</li>
                           <li className="pl-4 border-l-2 border-white/10 leading-relaxed"><strong className="text-white font-medium">Refund Policy:</strong> Since we provide a digital SaaS infrastructure and free preview tokens during setup, all paid subscription fees are non-refundable.</li>
                        </ul>
                     </div>
                  </div>
               </div>
            </div>
          )}

          {activeTab === 'shared_inbox' && (
            <div className="flex h-full p-6 gap-6">
                {/* Left Pane */}
                <div className="w-1/3 bg-black/40 border border-white/10 rounded-3xl flex flex-col overflow-hidden backdrop-blur-md">
                    <div className="p-5 border-b border-white/10 bg-black/20 text-white/80 font-medium tracking-wide">
                        Active Conversations
                    </div>
                    <div className="p-4 space-y-2 overflow-y-auto custom-scrollbar">
                        <div className="p-4 bg-white/10 rounded-2xl cursor-pointer border border-cyan-500/30">
                           <div className="flex justify-between items-center mb-2">
                              <span className="font-semibold text-sm">Customer #442</span>
                              <span className="text-xs text-white/50 bg-white/5 px-2 py-1 rounded-full">WhatsApp</span>
                           </div>
                           <p className="text-xs text-white/70 truncate">Asking about pricing...</p>
                        </div>
                    </div>
                </div>
                
                {/* Right Pane */}
                <div className="flex-1 bg-black/40 border border-white/10 rounded-3xl flex flex-col overflow-hidden backdrop-blur-xl">
                   <div className="p-5 border-b border-white/10 bg-[#075e54]/20 flex items-center gap-4">
                       <div className="w-12 h-12 rounded-full bg-black/40 flex items-center justify-center border border-[#25D366]/30">
                          <Users size={20} className="text-[#25D366]" />
                       </div>
                       <div>
                          <h3 className="font-medium tracking-wide">WhatsApp Live Simulator</h3>
                          <p className="text-xs text-white/50">Powered by GDX Auto-Reply</p>
                       </div>
                   </div>
                   
                   <div className="flex-1 p-6 overflow-y-auto custom-scrollbar space-y-6 flex flex-col bg-[#0b141a] relative z-0">
                       {/* Subtle dots pattern for whatsapp vibe */}
                       <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{backgroundImage: "radial-gradient(#fff 1px, transparent 1px)", backgroundSize: "20px 20px"}} />
                       
                       <div className="relative z-10 flex flex-col gap-6">
                         {simMessages.length === 0 && (
                            <div className="m-auto text-center p-6 bg-black/40 backdrop-blur-sm rounded-2xl border border-white/5 max-w-sm mt-10">
                               <p className="text-white/50 text-sm">Use the simulator below to test Zoya's WhatsApp auto-replies based on your Knowledge Base.</p>
                            </div>
                         )}
                         {simMessages.map(msg => (
                            <div key={msg.id} className={`max-w-[75%] p-4 rounded-2xl text-sm ${msg.sender === 'customer' ? 'bg-[#202c33] text-white self-start rounded-tl-sm shadow-md' : 'bg-[#005c4b] text-white self-end rounded-tr-sm shadow-md border border-[#00a884]/30'}`}>
                               <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                            </div>
                         ))}
                         <div ref={messagesEndRef} />
                       </div>
                   </div>
                   
                   <div className="px-4 py-3 bg-[#202c33] border-t border-white/5 flex gap-2 overflow-x-auto custom-scrollbar shrink-0">
                      <span className="text-xs font-semibold text-cyan-400 py-1.5 shrink-0 flex items-center gap-1">⚡ GDX Quick-Replies:</span>
                      {["/welcome", "/pricing", "/follow-up", "/meeting"].map((btn) => (
                         <button 
                            key={btn}
                            onClick={() => handleQuickReply(btn)}
                            disabled={appState === "processing"}
                            className="text-xs px-3 py-1.5 rounded-full bg-white/5 text-white/70 hover:bg-white/10 hover:text-white border border-white/10 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
                         >
                            {btn}
                         </button>
                      ))}
                   </div>

                   <div className="p-4 bg-[#202c33] border-t border-[#00a884]/20 flex gap-3 items-center">
                      <input 
                         type="text"
                         value={simInput}
                         onChange={e => setSimInput(e.target.value)}
                         onKeyDown={e => e.key === 'Enter' && handleSimulatorSend()}
                         placeholder="Simulate customer WhatsApp message (e.g. What is the price?)"
                         className="flex-1 bg-[#2a3942] rounded-full px-6 py-4 outline-none text-sm text-white placeholder:text-white/40 focus:ring-1 focus:ring-[#00a884] transition-all"
                      />
                      <button 
                         onClick={handleSimulatorSend}
                         disabled={!simInput.trim() || appState === 'processing'}
                         className="w-14 h-14 rounded-full bg-[#00a884] flex items-center justify-center disabled:opacity-50 hover:bg-[#008f6f] transition-all shrink-0"
                      >
                         {appState === 'processing' ? <Loader2 size={20} className="animate-spin text-white" /> : <Send size={20} className="text-white relative right-[2px]" />}
                      </button>
                   </div>
                </div>
            </div>
          )}

          {activeTab === 'leads' && (
            <div className="p-8">
               <div className="flex items-center justify-between mb-8">
                  <h2 className="text-2xl font-semibold">Active Leads Pipeline</h2>
                  <button className="px-4 py-2 bg-cyan-500 text-black font-semibold rounded-lg hover:bg-cyan-400 transition-colors">
                     + Add New Lead
                  </button>
               </div>
               
               <div className="w-full bg-black/40 border border-white/10 rounded-3xl overflow-hidden backdrop-blur-md">
                  <div className="overflow-x-auto">
                     <table className="w-full text-left border-collapse">
                        <thead>
                           <tr className="border-b border-white/10 bg-black/20 text-sm tracking-wide text-white/50">
                              <th className="px-6 py-4 font-medium uppercase">Company / Contact</th>
                              <th className="px-6 py-4 font-medium uppercase">Deal Value</th>
                              <th className="px-6 py-4 font-medium uppercase">Pipeline Status</th>
                              <th className="px-6 py-4 font-medium uppercase">Assigned Agent</th>
                              <th className="px-6 py-4 font-medium text-right uppercase">Actions</th>
                           </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                           {LEADS.map((lead, i) => (
                              <tr key={i} className="hover:bg-white/5 transition-colors group">
                                 <td className="px-6 py-5">
                                    <div className="flex flex-col">
                                       <span className="font-medium text-base text-white">{lead.name}</span>
                                       <span className="text-sm text-white/50 font-mono mt-0.5">{lead.contact}</span>
                                    </div>
                                 </td>
                                 <td className="px-6 py-5">
                                    <span className="font-mono text-cyan-400 font-medium text-base">{lead.amount}</span>
                                 </td>
                                 <td className="px-6 py-5">
                                    <span className={`px-3 py-1.5 text-xs font-semibold rounded-full border tracking-wide whitespace-nowrap ${
                                       lead.status === "🔥 Hot Lead" 
                                          ? "bg-red-500/20 text-red-400 border-red-500/30 shadow-[0_0_10px_rgba(239,68,68,0.2)]" 
                                          : "bg-white/5 border-white/10 text-white/70"
                                    }`}>
                                       {lead.status}
                                    </span>
                                 </td>
                                 <td className="px-6 py-5">
                                    <div className="flex items-center gap-2">
                                       <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                                          lead.agent === "ZY" ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30" : "bg-violet-500/20 text-violet-400 border border-violet-500/30"
                                       }`}>
                                          {lead.agent}
                                       </div>
                                       <span className="text-sm font-medium">{lead.agentName}</span>
                                    </div>
                                 </td>
                                 <td className="px-6 py-5 text-right">
                                    <button 
                                       onClick={() => setSelectedLead(lead)}
                                       className="text-sm text-cyan-500/70 hover:text-cyan-400 font-medium tracking-wide opacity-0 group-hover:opacity-100 transition-all underline underline-offset-4"
                                    >
                                       View Chat Logs
                                    </button>
                                 </td>
                              </tr>
                           ))}
                        </tbody>
                     </table>
                  </div>
               </div>
            </div>
          )}

          {activeTab === 'dashboard' && (
            <div className="p-8">
              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                {[
                  { label: "Total Active Leads", value: "1,284", trend: "+14.5%" },
                  { label: "Conversion Rate", value: "24.8%", trend: "+2.1%" },
                  { label: "Revenue Forecast", value: "$428.5k", trend: "+8.4%" },
                ].map((stat, i) => (
                  <div key={i} className="bg-black/40 border border-white/10 rounded-3xl p-6 hover:bg-white/5 transition-colors backdrop-blur-md">
                    <p className="text-sm text-white/50 mb-2 font-medium">{stat.label}</p>
                    <div className="flex items-end justify-between">
                      <p className="text-4xl font-light tracking-tight">{stat.value}</p>
                      <p className="text-sm font-bold text-cyan-400 bg-cyan-400/10 px-2 py-1 rounded-md">{stat.trend}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Main Panels */}
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 h-[500px]">
                 
                 {/* Left Panel: Recent Leads */}
                 <div className="xl:col-span-2 bg-black/40 border border-white/10 rounded-3xl p-6 flex flex-col backdrop-blur-md">
                    <h3 className="text-lg font-medium mb-6 flex items-center gap-2">
                      <Users size={18} className="text-cyan-400" />
                      Recent High-Value Leads
                    </h3>
                    <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-3">
                      {LEADS.map((lead, i) => (
                        <div 
                          key={i} 
                          onClick={() => setSelectedLead(lead)}
                          className="flex items-center justify-between p-4 rounded-2xl bg-white/5 hover:bg-white/10 transition-colors border border-transparent hover:border-cyan-500/30 cursor-pointer"
                        >
                          <div className="flex flex-col">
                            <span className="font-medium text-[15px]">{lead.name}</span>
                            <span className="text-xs text-white/50 mt-1">{lead.contact}</span>
                          </div>
                          <div className="flex items-center gap-6">
                            <span className="px-3 py-1 text-xs rounded-full bg-white/5 text-white/70 border border-white/10 tracking-wide">
                              {lead.status}
                            </span>
                            <span className="font-mono text-cyan-400 font-medium">{lead.amount}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                 </div>

                 {/* Right Panel: GDX AI Pipeline Log */}
                 <div className="bg-black/60 border border-cyan-500/30 rounded-3xl p-6 flex flex-col backdrop-blur-xl relative overflow-hidden shadow-[0_0_30px_rgba(6,182,212,0.05)]">
                    <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                      <div className="w-48 h-48 bg-cyan-500 rounded-full blur-[80px]" />
                    </div>
                    
                    <h3 className="text-lg font-medium mb-6 flex items-center gap-3 z-10">
                      <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_10px_rgba(34,211,238,1)]" />
                      GDX Content Pipeline
                      <button 
                        onClick={() => {
                            if(confirm("Clear logs?")) {
                               setMessages([]);
                               resetZoyaSession();
                            }
                        }}
                        className="ml-auto text-white/30 hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </h3>
                    
                    <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-2 z-10 flex flex-col">
                      {messages.length === 0 ? (
                        <div className="m-auto text-center text-white/30 text-sm">
                          <p>Pipeline is currently empty.</p>
                          <p className="mt-2 text-xs">Start a voice session to interact with Zoya.</p>
                        </div>
                      ) : (
                        messages.map((msg) => (
                          <div 
                            key={msg.id} 
                            className={`flex flex-col ${msg.sender === "user" ? "items-end" : "items-start"}`}
                          >
                            <div 
                              className={`max-w-[85%] p-3.5 rounded-2xl text-sm whitespace-pre-wrap leading-relaxed ${
                                msg.sender === "user" 
                                  ? "bg-white/10 border border-white/10 text-white rounded-br-sm" 
                                  : "bg-cyan-900/30 border border-cyan-500/30 text-cyan-50 rounded-bl-sm shadow-[0_0_15px_rgba(6,182,212,0.1)]"
                              }`}
                            >
                               {msg.text}
                            </div>
                          </div>
                        ))
                      )}
                      <div ref={messagesEndRef} />
                    </div>
                 </div>

              </div>
            </div>
          )}
        </div>

        {/* Kanban Drawer Overlay */}
        <AnimatePresence>
          {selectedLead && (
            <motion.div 
               initial={{ x: '100%' }}
               animate={{ x: 0 }}
               exit={{ x: '100%' }}
               transition={{ type: "spring", damping: 25, stiffness: 200 }}
               className="absolute top-0 right-0 w-full sm:w-[500px] h-full bg-black/80 border-l border-cyan-500/30 shadow-[0_0_80px_rgba(6,182,212,0.15)] z-50 flex flex-col backdrop-blur-2xl"
            >
               <div className="p-8 border-b border-white/10 flex justify-between items-start bg-gradient-to-b from-cyan-900/10 to-transparent">
                  <div>
                     <h3 className="text-3xl font-semibold text-cyan-400 mb-2">{selectedLead.name}</h3>
                     <p className="text-sm font-mono text-white/50">{selectedLead.contact}</p>
                  </div>
                  <button onClick={() => setSelectedLead(null)} className="p-3 bg-white/5 hover:bg-white/10 rounded-full transition-colors">
                     <X size={20} />
                  </button>
               </div>
               <div className="p-8 flex-1 overflow-y-auto custom-scrollbar">
                  <div className="flex items-center gap-4 mb-8 bg-black/40 p-5 rounded-2xl border border-white/10">
                     <div className="w-12 h-12 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-lg border border-cyan-500/30">
                        {selectedLead.agent}
                     </div>
                     <div>
                        <p className="text-xs text-white/50 mb-1 uppercase tracking-wider">Assigned Agent</p>
                        <p className="font-medium text-[15px]">{selectedLead.agentName}</p>
                     </div>
                  </div>
                  
                  <h4 className="text-sm font-medium mb-4 text-white/50 uppercase tracking-wider">Interaction History</h4>
                  <div className="space-y-4">
                     {selectedLead.messages.length > 0 ? selectedLead.messages.map((m: any, i: number) => (
                        <div key={i} className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}>
                           <div className={`p-4 rounded-2xl text-sm max-w-[85%] ${m.sender === 'user' ? 'bg-white/5 border border-white/10 text-white rounded-tr-sm' : 'bg-cyan-900/20 border border-cyan-500/30 text-cyan-50 rounded-tl-sm'}`}>
                             <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>
                           </div>
                        </div>
                     )) : (
                        <div className="text-center p-8 border border-white/5 rounded-2xl bg-white/5">
                           <p className="text-sm text-white/40 italic">No previous interactions found.</p>
                        </div>
                     )}
                  </div>
               </div>
            </motion.div>
          )}
        </AnimatePresence>

      </main>
    </div>
  );
}

