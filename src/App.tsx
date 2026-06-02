import React, { useState, useEffect, useRef, useCallback } from "react";
import { Mic, MicOff, Loader2, Volume2, VolumeX, Keyboard, Send, Trash2, LayoutDashboard, Users, BarChart3, Settings, LogOut, Search, Bell, MessageSquare, X, HelpCircle, Copy, Check, FileText, PlusCircle, CreditCard, ExternalLink } from "lucide-react";
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

const VipSetupBanner = () => (
  <div className="mt-8 bg-gradient-to-r from-[#25D366]/10 to-transparent border border-[#25D366]/20 rounded-3xl p-8 relative overflow-hidden">
    <div className="absolute -right-20 -top-20 w-64 h-64 bg-[#25D366]/5 rounded-full blur-3xl"></div>
    <h3 className="text-xl font-semibold text-white mb-3 flex items-center gap-2">
      ⚙️ Professional Meta API Setup Service
    </h3>
    <p className="text-sm text-white/70 mb-4 leading-relaxed max-w-2xl">
      Facing issues with Meta Developer Portal, Webhooks, or Token generation? Let our expert handle 100% of the configuration and verification for you!
      <br /><br />
      <span className="text-white/50 text-xs uppercase tracking-wider font-semibold">Note: This is a premium white-glove service and carries an additional setup fee.</span>
    </p>
    <div className="flex items-center gap-4 mt-6">
      <span className="text-sm font-medium text-white/60">📞 Contact our Deployment Engineer directly on WhatsApp:</span>
      <a
        href="https://wa.me/917065162279"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 px-6 py-3 bg-[#25D366]/10 hover:bg-[#25D366]/20 text-[#25D366] border border-[#25D366]/30 rounded-full transition-all shadow-[0_0_15px_rgba(37,211,102,0.15)] hover:shadow-[0_0_25px_rgba(37,211,102,0.3)] font-semibold"
      >
        <MessageSquare size={18} />
        +91 7065162279
      </a>
    </div>
  </div>
);

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(() => localStorage.getItem("gdx_auth") === "true");
  const [activeTab, setActiveTab] = useState<"dashboard" | "shared_inbox" | "leads" | "settings" | "templates" | "billing">("dashboard");
  const [knowledgeBase, setKnowledgeBase] = useState(() => localStorage.getItem("gdx_knowledge_base") || "");
  const [backendUrl, setBackendUrl] = useState(() => localStorage.getItem("gdx_backend_url") || "https://ddxcrm.onrender.com");
  const [phoneNumberId, setPhoneNumberId] = useState(() => localStorage.getItem("gdx_phone_number_id") || "");
  const [metaAccessToken, setMetaAccessToken] = useState(() => localStorage.getItem("gdx_meta_access_token") || "");
  const [wabaId, setWabaId] = useState(() => localStorage.getItem("gdx_waba_id") || "");
  const [isSavedReassure, setIsSavedReassure] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [configStatus, setConfigStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [isConnected, setIsConnected] = useState(() => localStorage.getItem("gdx_is_connected") === "true");
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [showLegalModal, setShowLegalModal] = useState(false);
  const [isTokenCopied, setIsTokenCopied] = useState(false);
  const [selectedLead, setSelectedLead] = useState<any>(null);

  const handleRazorpayCheckout = (planName: string, amount: number, customKey?: string) => {
    const loadRazorpayScript = () => {
      return new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.onload = () => resolve(true);
        script.onerror = () => resolve(false);
        document.body.appendChild(script);
      });
    };

    const runCheckout = async () => {
      await loadRazorpayScript();
      
      if (typeof (window as any).Razorpay === 'undefined') {
        console.error('Razorpay SDK failed to load properly.');
        return;
      }
      
      const options = {
        key: 'rzp_live_SmYI9h1s1WboEw',
        amount: amount * 100, // Amount is in currency subunits. Default currency is INR. Hence, 50000 refers to 50000 paise
        currency: 'INR',
        name: 'GDX CRM',
        description: `${planName} Subscription`,
        handler: function (response: any) {
          if (response.razorpay_payment_id) {
            alert("Success! ID: " + response.razorpay_payment_id);
          }
        },
        modal: {
          ondismiss: function() {
            console.log("User closed payment gateway interface window securely.");
          }
        },
        prefill: {
          name: 'GDX User',
          email: 'user@example.com',
          contact: '9999999999'
        },
        theme: {
          color: '#06b6d4' // cyan-500
        }
      };
      
      try {
        const rzp = new (window as any).Razorpay(options);
        rzp.open();
      } catch (error) {
        console.error("Error initializing Razorpay", error);
      }
    }
    runCheckout();
  };

  // WhatsApp Templates States
  const [templates, setTemplates] = useState<{name: string, category: string, language: string, bodyText: string}[]>(() => {
    const saved = localStorage.getItem("gdx_templates");
    return saved ? JSON.parse(saved) : [
      { name: "welcome_message", category: "UTILITY", language: "en_US", bodyText: "Hello {{1}}, welcome to GDX CRM! your account registration is successful." },
      { name: "order_confirmation", category: "UTILITY", language: "en_US", bodyText: "Hi {{1}}, order #{{2}} is confirmed. Total amount: {{3}}. Thank you for shopping with us!" }
    ];
  });

  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateCategory, setNewTemplateCategory] = useState("UTILITY");
  const [newTemplateLanguage, setNewTemplateLanguage] = useState("en_US");
  const [newTemplateBody, setNewTemplateBody] = useState("");
  const [isCreatingTemplate, setIsCreatingTemplate] = useState(false);
  const [createTemplateError, setCreateTemplateError] = useState("");
  const [createTemplateSuccess, setCreateTemplateSuccess] = useState("");

  const [selectedTemplateName, setSelectedTemplateName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [templateVariables, setTemplateVariables] = useState<{[key: string]: string}>({});
  const [isSendingTemplate, setIsSendingTemplate] = useState(false);
  const [sendTemplateError, setSendTemplateError] = useState("");
  const [sendTemplateSuccess, setSendTemplateSuccess] = useState("");

  // Helper: Find design parameters (e.g. {{1}}, {{2}})
  const getTemplateVariables = (bodyText: string): string[] => {
    const vars: string[] = [];
    const regex = /\{\{(\d+)\}\}/g;
    let match;
    while ((match = regex.exec(bodyText)) !== null) {
      if (!vars.includes(match[1])) {
        vars.push(match[1]);
      }
    }
    return vars.sort((a, b) => parseInt(a) - parseInt(b));
  };

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateTemplateError("");
    setCreateTemplateSuccess("");
    
    if (!metaAccessToken || !wabaId) {
      setCreateTemplateError("Please configure Meta Access Token and WABA ID in the Settings tab first!");
      return;
    }
    if (!newTemplateName) {
      setCreateTemplateError("Template name is required.");
      return;
    }

    // Format to lowercase, letters/numbers/underscores only
    const cleanName = newTemplateName.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    if (!newTemplateBody) {
      setCreateTemplateError("Template body text is required.");
      return;
    }

    setIsCreatingTemplate(true);
    try {
      const targetUrl = backendUrl.endsWith('/') ? backendUrl.slice(0, -1) : backendUrl;
      const res = await fetch(`${targetUrl}/api/create-template`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken: metaAccessToken,
          wabaId,
          templateName: cleanName,
          category: newTemplateCategory,
          language: newTemplateLanguage,
          bodyText: newTemplateBody
        })
      });

      const data = await res.json();
      if (!res.ok || data.success === false) {
        throw new Error(data.error?.error?.message || data.error?.message || data.error || "Failed registration on Meta API");
      }

      const addedTemplate = {
        name: cleanName,
        category: newTemplateCategory,
        language: newTemplateLanguage,
        bodyText: newTemplateBody
      };

      const updated = [...templates.filter(t => t.name !== cleanName), addedTemplate];
      setTemplates(updated);
      localStorage.setItem("gdx_templates", JSON.stringify(updated));

      setCreateTemplateSuccess(`🎉 Template "${cleanName}" submitted successfully & saved locally!`);
      setNewTemplateName("");
      setNewTemplateBody("");
    } catch (err: any) {
      console.error("Template creation error:", err);
      setCreateTemplateError(`⚠️ Meta Error: ${err.message || err.toString()}`);
    } finally {
      setIsCreatingTemplate(false);
    }
  };

  const handleSendTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSendTemplateError("");
    setSendTemplateSuccess("");

    if (!metaAccessToken || !phoneNumberId) {
      setSendTemplateError("Please configure Meta Access Token and Phone ID in the Settings tab first!");
      return;
    }
    if (!selectedTemplateName) {
      setSendTemplateError("Please select a template to dispatch.");
      return;
    }
    if (!recipientPhone) {
      setSendTemplateError("Recipient Phone Number is required.");
      return;
    }

    const templateObj = templates.find(t => t.name === selectedTemplateName);
    if (!templateObj) {
      setSendTemplateError("Selected template details not found.");
      return;
    }

    const vars = getTemplateVariables(templateObj.bodyText);
    const bodyComponents: string[] = [];
    
    for (const v of vars) {
      const val = templateVariables[v];
      if (val === undefined || val === null || val.trim() === "") {
        setSendTemplateError(`Please provide reference text for variable {{${v}}}.`);
        return;
      }
      bodyComponents.push(val.trim());
    }

    setIsSendingTemplate(true);
    try {
      const targetUrl = backendUrl.endsWith('/') ? backendUrl.slice(0, -1) : backendUrl;
      const res = await fetch(`${targetUrl}/api/send-template`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken: metaAccessToken,
          phoneNumberId,
          recipientPhone: recipientPhone.trim(),
          templateName: selectedTemplateName,
          languageCode: templateObj.language || "en_US",
          bodyComponents
        })
      });

      const data = await res.json();
      if (!res.ok || data.success === false) {
        throw new Error(data.error?.error?.message || data.error?.message || data.error || "Failed sending template via Meta");
      }

      setSendTemplateSuccess(`🚀 Template Message "${selectedTemplateName}" dispatched successfully!`);
      setRecipientPhone("");
      setTemplateVariables({});
    } catch (err: any) {
      console.error("Template dispatch error:", err);
      setSendTemplateError(`⚠️ dispatch Failed: ${err.message || err.toString()}`);
    } finally {
      setIsSendingTemplate(false);
    }
  };
  
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
    localStorage.setItem("gdx_phone_number_id", phoneNumberId);
    localStorage.setItem("gdx_meta_access_token", metaAccessToken);
    localStorage.setItem("gdx_waba_id", wabaId);
    setZoyaKnowledgeBase(knowledgeBase);
    setLiveZoyaKnowledgeBase(knowledgeBase);
  }, [knowledgeBase, backendUrl, phoneNumberId, metaAccessToken, wabaId]);

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
    setIsSavingConfig(true);
    setConfigStatus(null);
    
    if (!phoneNumberId || !metaAccessToken || !wabaId) {
      setConfigStatus({ type: 'error', message: '⚠️ Connection Failed. Please double-check your Meta IDs and internet connection.' });
      setIsSavingConfig(false);
      setIsConnected(false);
      localStorage.setItem("gdx_is_connected", "false");
      return;
    }

    try {
      if (backendUrl) {
        const targetUrl = backendUrl.endsWith('/') ? backendUrl.slice(0, -1) : backendUrl;
        const res = await fetch(`${targetUrl}/api/tokens/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phoneNumberId, metaAccessToken, wabaId, knowledgeBase })
        });
        if (!res.ok) throw new Error("API returned not ok");
      }
      
      await new Promise(res => setTimeout(res, 800)); // Simulate verifying connection
      
      setConfigStatus({ type: 'success', message: '🎉 Setup Success! Your AI WhatsApp Assistant is now active and live.' });
      setIsConnected(true);
      localStorage.setItem("gdx_is_connected", "true");
      setIsSavedReassure(true);
      
      if(saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        setIsSavedReassure(false);
        setConfigStatus(null);
      }, 5000);
      
    } catch (err) {
      console.error("Failed to sync config with backend", err);
      setConfigStatus({ type: 'error', message: '⚠️ Connection Failed. Please double-check your Meta IDs and internet connection.' });
      setIsConnected(false);
      localStorage.setItem("gdx_is_connected", "false");
    } finally {
      setIsSavingConfig(false);
    }
  };

  const [showQRModal, setShowQRModal] = useState(false);

  const handleCopyToken = () => {
    navigator.clipboard.writeText("GdxZishanSecret123");
    setIsTokenCopied(true);
    setTimeout(() => setIsTokenCopied(false), 2000);
  };

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

        {/* Legal & Policies Modal */}
        {showLegalModal && (
          <motion.div 
             initial={{ opacity: 0 }}
             animate={{ opacity: 1 }}
             exit={{ opacity: 0 }}
             className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          >
             <motion.div 
                initial={{ scale: 0.95 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.95 }}
                className="bg-[#111b21] border border-white/10 rounded-3xl p-8 max-w-2xl w-full mx-4 flex flex-col shadow-[0_20px_60px_rgba(0,0,0,0.8),0_0_40px_rgba(6,182,212,0.1)] relative max-h-[85vh] overflow-hidden"
             >
                <button onClick={() => setShowLegalModal(false)} className="absolute top-6 right-6 text-white/50 hover:text-white transition-colors p-2 bg-white/5 rounded-full hover:bg-white/10 z-10">
                   <X size={20} />
                </button>
                <div className="mb-6 border-b border-white/10 pb-4 shrink-0">
                   <h3 className="text-2xl font-semibold text-white flex items-center gap-2">
                       Legal & Policies
                   </h3>
                   <p className="text-sm text-white/50 mt-1">Compliance terms required for Razorpay merchant guidelines.</p>
                </div>

                <div className="overflow-y-auto custom-scrollbar flex-1 pr-4 space-y-8">
                   <div>
                      <h4 className="text-lg font-medium text-cyan-400 mb-2">Privacy Policy</h4>
                      <p className="text-sm text-white/70 leading-relaxed">
                         We collect user registration data, email, and WhatsApp business API details securely to provide automated CRM services. We never share user data with third parties.
                      </p>
                   </div>
                   
                   <div>
                      <h4 className="text-lg font-medium text-cyan-400 mb-2">Terms & Conditions</h4>
                      <p className="text-sm text-white/70 leading-relaxed">
                         The service is provided as a monthly/annual SaaS subscription for automated WhatsApp notifications. Users are responsible for complying with Meta's official commerce policies.
                      </p>
                   </div>
                   
                   <div>
                      <h4 className="text-lg font-medium text-cyan-400 mb-2">Refund & Cancellation Policy</h4>
                      <p className="text-sm text-white/70 leading-relaxed">
                         We offer a 7-day free trial for users to test the product. Once a paid subscription is processed via Razorpay, cancellations can be requested anytime, but refunds for the current billing cycle will not be provided. For custom setup services, the one-time fee is completely non-refundable.
                      </p>
                   </div>

                   <div className="bg-white/5 border border-white/10 rounded-2xl p-5 mb-4">
                      <h4 className="text-base font-medium text-white mb-2">Contact Us</h4>
                      <p className="text-sm text-white/70 leading-relaxed">
                         For support, billing issues, or policy queries, contact us on WhatsApp: +91 7065162279
                      </p>
                   </div>
                </div>
             </motion.div>
          </motion.div>
        )}

        {/* Setup Guide Modal */}
        {showSetupModal && (
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
                className="bg-[#111b21] border border-white/10 rounded-3xl p-8 max-w-lg w-full mx-4 flex flex-col shadow-[0_20px_60px_rgba(0,0,0,0.8),0_0_40px_rgba(6,182,212,0.1)] relative"
             >
                <button onClick={() => setShowSetupModal(false)} className="absolute top-6 right-6 text-white/50 hover:text-white transition-colors p-2 bg-white/5 rounded-full hover:bg-white/10">
                   <X size={20} />
                </button>
                <div className="mb-6 border-b border-white/10 pb-4">
                   <h3 className="text-xl font-semibold text-white mb-2 flex items-center gap-2">
                       <HelpCircle className="text-cyan-400" size={24} />
                       Meta Webhook Setup Instructions
                   </h3>
                </div>
                
                <div className="space-y-6 text-white/80 leading-relaxed">
                   <div className="flex flex-col gap-1.5 object-cover">
                      <span className="font-semibold text-cyan-400 text-sm tracking-wide">Step 1:</span>
                      <p className="text-sm">Go to your Meta Developer Portal and navigate to WhatsApp &gt; Configuration.</p>
                   </div>
                   <div className="flex flex-col gap-1.5">
                      <span className="font-semibold text-cyan-400 text-sm tracking-wide">Step 2:</span>
                      <p className="text-sm">In the "Callback URL" field, copy and paste your custom Webhook URL shown on this dashboard.</p>
                   </div>
                   <div className="flex flex-col gap-1.5">
                      <span className="font-semibold text-cyan-400 text-sm tracking-wide">Step 3:</span>
                      <p className="text-sm">In the "Verify Token" field, enter the exact master secret password given below:</p>
                      <div className="flex items-center gap-3 mt-1 bg-black/50 border border-white/10 rounded-xl p-3 shadow-inner">
                         <span className="text-cyan-400 shrink-0">👉</span>
                         <span className="font-mono text-white/90 truncate mr-auto tracking-wide text-sm">GdxZishanSecret123</span>
                         <button 
                            onClick={handleCopyToken}
                            className="shrink-0 p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-all flex items-center gap-1.5 shadow-sm"
                         >
                            {isTokenCopied ? <Check size={16} className="text-[#25D366]" /> : <Copy size={16} />}
                            <span className="text-xs font-medium">{isTokenCopied ? "Copied" : "Copy"}</span>
                         </button>
                      </div>
                   </div>
                   <div className="flex flex-col gap-1.5">
                      <span className="font-semibold text-cyan-400 text-sm tracking-wide">Step 4:</span>
                      <p className="text-sm">Click "Verify and Save" on Meta. Once done, come back here, enter your personal Access Token, Phone ID, and WABA ID, then click Save!</p>
                   </div>
                </div>
                
                <div className="mt-8 flex justify-end">
                   <button onClick={() => setShowSetupModal(false)} className="px-6 py-2.5 bg-white/10 text-white font-medium rounded-xl hover:bg-white/20 transition-colors shadow-sm">
                      Got it, thanks!
                   </button>
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
      <aside className="w-64 border-r border-white/10 bg-black/40 backdrop-blur-xl flex flex-col z-10 flex-shrink-0">
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
            onClick={() => setActiveTab("templates")}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'templates' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' : 'hover:bg-white/5 text-white/70 hover:text-white border border-transparent'}`}
          >
            <FileText size={18} />
            <span className="font-medium text-sm">WA Templates</span>
          </button>
          <button 
            onClick={() => setActiveTab("settings")}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'settings' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' : 'hover:bg-white/5 text-white/70 hover:text-white border border-transparent'}`}
          >
            <Settings size={18} />
            <span className="font-medium text-sm">Settings</span>
          </button>
          <button 
            onClick={() => setActiveTab("billing")}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'billing' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' : 'hover:bg-white/5 text-white/70 hover:text-white border border-transparent'}`}
          >
            <CreditCard size={18} />
            <span className="font-medium text-sm">Billing</span>
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

          <div className="mt-4 pt-4 border-t border-white/5 flex flex-col gap-2 px-2">
            <button onClick={() => setShowLegalModal(true)} className="text-[10px] text-white/40 hover:text-cyan-400 text-left transition-colors font-medium">Privacy Policy</button>
            <button onClick={() => setShowLegalModal(true)} className="text-[10px] text-white/40 hover:text-cyan-400 text-left transition-colors font-medium">Terms & Conditions</button>
            <button onClick={() => setShowLegalModal(true)} className="text-[10px] text-white/40 hover:text-cyan-400 text-left transition-colors font-medium">Refund & Cancellation Policy</button>
          </div>
        </div>
      </aside>

      {/* Main Container */}
      <main className="flex-1 flex flex-col h-screen min-w-0 z-10 relative overflow-hidden">
        {configStatus && (
          <div className="absolute top-6 right-6 z-50 animate-in fade-in slide-in-from-top-4 duration-300">
            <div className={`px-5 py-3 rounded-xl shadow-2xl border backdrop-blur-md font-medium tracking-wide flex items-center gap-3 ${
              configStatus.type === 'success' 
              ? 'bg-[#25D366]/10 border-[#25D366]/30 text-[#25D366]' 
              : 'bg-red-500/10 border-red-500/30 text-red-400'
            }`}>
              {configStatus.message}
            </div>
          </div>
        )}
        {/* Header */}
        <header className="h-20 border-b border-white/10 bg-black/20 backdrop-blur-md flex items-center justify-between px-8 shrink-0">
          <h2 className="text-xl font-medium tracking-wide">
            {activeTab === 'dashboard' && 'Dashboard Overview'}
            {activeTab === 'shared_inbox' && 'Shared Inbox / Simulations'}
            {activeTab === 'leads' && 'Active Leads'}
            {activeTab === 'templates' && 'WhatsApp Templates'}
            {activeTab === 'settings' && 'System Settings'}
            {activeTab === 'billing' && 'Billing & Premium Setup'}
          </h2>
          <div className="flex items-center gap-6">
            <div className="hidden lg:flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10">
              <div className={`w-2 h-2 rounded-full shadow-[0_0_8px_currentColor] ${isConnected ? 'bg-[#25D366] text-[#25D366] animate-pulse' : 'bg-red-500 text-red-500'}`} />
              <span className={`text-xs font-semibold ${isConnected ? 'text-[#25D366]/80' : 'text-red-400/80'}`}>
                {isConnected ? 'System Status: Connected & Running' : 'System Status: Disconnected'}
              </span>
            </div>
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
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 p-4 lg:p-6 overflow-y-auto h-[calc(100vh-80px)] custom-scrollbar relative min-w-0">
          
          {/* Main Workspace (Left) */}
          <div className="lg:col-span-8 flex-col flex min-w-0 order-2 lg:order-1 w-full">
          
          {activeTab === 'templates' && (
            <div className="p-8 font-sans max-w-7xl mx-auto">
               <div className="mb-8">
                  <h2 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
                     <FileText className="text-cyan-400" size={32} />
                     WhatsApp Templates Management
                  </h2>
                  <p className="text-sm text-white/50 mt-2">Create custom message layouts and dispatch approved templates to your leads using the Meta Cloud API integration.</p>
               </div>

               <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                  
                  {/* Left Column: Create Template Form */}
                  <div className="bg-black/45 border border-white/10 rounded-3xl p-8 backdrop-blur-md shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex flex-col gap-6 relative overflow-hidden group">
                     <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-emerald-500/50 to-cyan-500/50 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                     
                     <div>
                        <h3 className="text-xl font-semibold text-white mb-1 flex items-center gap-2">
                           <PlusCircle className="text-emerald-400" size={20} />
                           Create New Template
                        </h3>
                        <p className="text-xs text-white/40">Register a new template pattern with your Meta developer account.</p>
                     </div>

                     <form onSubmit={handleCreateTemplate} className="space-y-5">
                        <div className="flex flex-col gap-2">
                           <label className="text-xs font-semibold text-white/70 uppercase tracking-wider">Template Name</label>
                           <input 
                              type="text"
                              value={newTemplateName}
                              onChange={(e) => setNewTemplateName(e.target.value.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, ""))}
                              className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 transition-all font-mono placeholder:text-white/20"
                              placeholder="e.g. order_success"
                              required
                           />
                           <span className="text-[10px] text-white/40 font-medium font-sans">Meta rule: Lowercase letters, numbers, and underscores only.</span>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                           <div className="flex flex-col gap-2">
                              <label className="text-xs font-semibold text-white/70 uppercase tracking-wider">Category</label>
                              <select 
                                 value={newTemplateCategory}
                                 onChange={(e) => setNewTemplateCategory(e.target.value)}
                                 className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 transition-all cursor-pointer"
                              >
                                 <option value="UTILITY">Utility</option>
                                 <option value="MARKETING">Marketing</option>
                              </select>
                           </div>
                           <div className="flex flex-col gap-2">
                              <label className="text-xs font-semibold text-white/70 uppercase tracking-wider">Language</label>
                              <select 
                                 value={newTemplateLanguage}
                                 onChange={(e) => setNewTemplateLanguage(e.target.value)}
                                 className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 transition-all cursor-pointer"
                              >
                                 <option value="en_US">English (US)</option>
                                 <option value="hi_IN">Hindi (IN)</option>
                                 <option value="es_ES">Spanish (ES)</option>
                                 <option value="ar_AE">Arabic (AE)</option>
                              </select>
                           </div>
                        </div>

                        <div className="flex flex-col gap-2">
                           <div className="flex justify-between items-center">
                              <label className="text-xs font-semibold text-white/70 uppercase tracking-wider">Template Body Text</label>
                              <span className="text-[10px] text-cyan-400 font-semibold bg-cyan-400/10 px-2 py-0.5 rounded">Dynamic Support</span>
                           </div>
                           <textarea 
                              value={newTemplateBody}
                              onChange={(e) => setNewTemplateBody(e.target.value)}
                              rows={4}
                              className="w-full bg-black/60 border border-white/10 rounded-xl p-4 text-sm text-white focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 transition-all placeholder:text-white/20 custom-scrollbar"
                              placeholder="Hi {{1}}, thank you for buying {{2}}. Your tracking ID is {{3}}."
                              required
                           />
                           <p className="text-[11px] text-[#25D366] font-medium leading-relaxed bg-[#25D366]/5 p-3 rounded-lg border border-[#25D366]/10">
                              ℹ️ <strong>Heads up:</strong> Use {"{{1}}"}, {"{{2}}"} etc., to match your variables block. These can be filled with customer details later during dispatch!
                           </p>
                        </div>

                        {createTemplateError && (
                           <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-xs font-medium">
                              {createTemplateError}
                           </div>
                        )}
                        {createTemplateSuccess && (
                           <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs font-medium">
                              {createTemplateSuccess}
                           </div>
                        )}

                        <button 
                           type="submit"
                           disabled={isCreatingTemplate}
                           className="w-full py-3.5 bg-[#25D366] text-black font-semibold rounded-xl hover:bg-[#20ba59] active:scale-[0.99] disabled:opacity-50 transition-all duration-200 shadow-[0_4px_20px_rgba(37,211,102,0.3)] flex items-center justify-center gap-2 cursor-pointer"
                        >
                           {isCreatingTemplate ? (
                              <>
                                 <Loader2 className="animate-spin text-black" size={18} />
                                 <span>Submitting to Meta...</span>
                              </>
                           ) : (
                              <span>Submit to Meta for Approval ✔️</span>
                           )}
                        </button>
                     </form>
                  </div>

                  {/* Right Column: Send Template Quick Form */}
                  <div className="bg-black/45 border border-white/10 rounded-3xl p-8 backdrop-blur-md shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex flex-col gap-6 relative overflow-hidden group">
                     <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-cyan-500/50 to-blue-500/50 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                     
                     <div>
                        <h3 className="text-xl font-semibold text-white mb-1 flex items-center gap-2">
                           <Send size={18} className="text-cyan-400" />
                           Send Template Message
                        </h3>
                        <p className="text-xs text-white/40">Instantly trigger an approved template to a customer's phone line.</p>
                     </div>

                     <form onSubmit={handleSendTemplate} className="space-y-5">
                        <div className="flex flex-col gap-2">
                           <label className="text-xs font-semibold text-white/70 uppercase tracking-wider">Select template pattern</label>
                           <select 
                              value={selectedTemplateName}
                              onChange={(e) => {
                                 setSelectedTemplateName(e.target.value);
                                 setTemplateVariables({});
                                 setSendTemplateError("");
                                 setSendTemplateSuccess("");
                              }}
                              className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30 transition-all cursor-pointer"
                              required
                           >
                              <option value="">-- Choose template --</option>
                              {templates.map(t => (
                                 <option key={t.name} value={t.name}>{t.name} ({t.category})</option>
                              ))}
                           </select>
                        </div>

                        {/* Live Template Preview Container if one is selected */}
                        {selectedTemplateName && (() => {
                           const activeTpl = templates.find(t => t.name === selectedTemplateName);
                           if (!activeTpl) return null;

                           let previewText = activeTpl.bodyText;
                           const vars = getTemplateVariables(activeTpl.bodyText);
                           vars.forEach(v => {
                              const placeholderVal = templateVariables[v] || `[Variable ${v}]`;
                              previewText = previewText.replace(`{{${v}}}`, placeholderVal);
                           });

                           return (
                              <div className="bg-[#0b141a] border border-white/5 rounded-2xl p-4 flex flex-col gap-2">
                                 <span className="text-[10px] text-white/30 uppercase tracking-widest font-semibold flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#25D366]" />
                                    Live Message Preview
                                 </span>
                                 <div className="bg-[#111b21] rounded-xl p-4 text-xs font-medium text-white/90 shadow-inner relative max-w-xs self-start border border-white/5 whitespace-pre-wrap">
                                    <div className="absolute top-2 right-2 w-2 h-2 rounded-full cursor-help bg-white/10" />
                                    <p className="leading-relaxed">{previewText}</p>
                                    <span className="block text-right text-[9px] text-white/40 mt-1.5 font-mono">11:30 AM ✔️</span>
                                 </div>
                              </div>
                           );
                        })()}

                        {/* Custom Dynamic Variable Fields */}
                        {selectedTemplateName && (() => {
                           const activeTpl = templates.find(t => t.name === selectedTemplateName);
                           if (!activeTpl) return null;
                           const vars = getTemplateVariables(activeTpl.bodyText);
                           if (vars.length === 0) return null;

                           return (
                              <div className="space-y-4 bg-white/5 p-4 rounded-xl border border-white/5">
                                 <h4 className="text-xs font-bold text-white/70 uppercase tracking-wide mb-1 flex items-center gap-1">
                                    <span>🧩 Template Parameters</span>
                                 </h4>
                                 <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {vars.map(v => (
                                       <div key={v} className="flex flex-col gap-1.5">
                                          <label className="text-[10px] text-white/50 font-mono">Value for {"{"}{"{"}{v}{"}"}{"}"}</label>
                                          <input 
                                             type="text"
                                             value={templateVariables[v] || ""}
                                             onChange={(e) => setTemplateVariables({
                                                ...templateVariables,
                                                [v]: e.target.value
                                             })}
                                             className="w-full bg-black/60 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500/50 transition-all placeholder:text-white/20"
                                             placeholder={`eg. value for {{${v}}}`}
                                             required
                                          />
                                       </div>
                                    ))}
                                 </div>
                              </div>
                           );
                        })()}

                        <div className="flex flex-col gap-2">
                           <label className="text-xs font-semibold text-white/70 uppercase tracking-wider">Recipient Phone Number</label>
                           <input 
                              type="tel"
                              value={recipientPhone}
                              onChange={(e) => setRecipientPhone(e.target.value)}
                              className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30 transition-all placeholder:text-white/20"
                              placeholder="e.g. +919876543210 (include country code)"
                              required
                           />
                        </div>

                        {sendTemplateError && (
                           <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-xs font-medium">
                              {sendTemplateError}
                           </div>
                        )}
                        {sendTemplateSuccess && (
                           <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs font-medium">
                              {sendTemplateSuccess}
                           </div>
                        )}

                        <button 
                           type="submit"
                           disabled={isSendingTemplate}
                           className="w-full py-3.5 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold rounded-xl hover:from-cyan-400 hover:to-blue-400 active:scale-[0.99] disabled:opacity-50 transition-all duration-200 shadow-[0_4px_20px_rgba(6,182,212,0.3)] flex items-center justify-center gap-2 cursor-pointer"
                        >
                           {isSendingTemplate ? (
                              <>
                                 <Loader2 className="animate-spin text-white" size={18} />
                                 <span>Sending dispatch...</span>
                              </>
                           ) : (
                              <span>Send Template Message 🚀</span>
                           )}
                        </button>
                     </form>
                  </div>

               </div>
            </div>
          )}

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
                        disabled={isSavingConfig}
                        className={`px-6 py-2.5 font-semibold tracking-wide rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                           isSavedReassure 
                              ? "bg-[#25D366]/20 text-[#25D366] border border-[#25D366]/50 shadow-[0_0_15px_rgba(37,211,102,0.1)]" 
                              : "bg-cyan-600/20 text-cyan-400 border border-cyan-500/50 hover:bg-cyan-600/30 shadow-[0_0_15px_rgba(6,182,212,0.1)]"
                        }`}
                     >
                        {isSavingConfig ? "🔄 Connecting & Verifying..." : isSavedReassure ? "✓ Configuration Saved Alive!" : "💾 Save Configuration"}
                     </button>
                  </div>
               </div>

               <div className="bg-black/40 border border-white/10 rounded-3xl p-8 backdrop-blur-md mt-6">
                  <h3 className="text-lg font-medium mb-6 text-cyan-400">🔌 WhatsApp API Configuration</h3>
                  <div className="space-y-4">
                     <div className="flex flex-col gap-1.5">
                        <label className="text-sm text-white/70">Meta Permanent Access Token</label>
                        <input type="password" value={metaAccessToken} onChange={(e) => setMetaAccessToken(e.target.value)} className="w-full bg-black/50 border border-white/10 rounded-xl p-3 text-white placeholder:text-white/30 outline-none focus:border-cyan-500/50 transition-colors" placeholder="EAAb...." />
                     </div>
                     <div className="flex flex-col gap-1.5">
                        <label className="text-sm text-white/70">WhatsApp Phone Number ID</label>
                        <input type="text" value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} className="w-full bg-black/50 border border-white/10 rounded-xl p-3 text-white placeholder:text-white/30 outline-none focus:border-cyan-500/50 transition-colors" placeholder="Enter your 15-digit Phone Number ID" />
                     </div>
                     <div className="flex flex-col gap-1.5">
                        <label className="text-sm text-white/70">WhatsApp Business Account ID (WABA ID)</label>
                        <input type="text" value={wabaId} onChange={(e) => setWabaId(e.target.value)} className="w-full bg-black/50 border border-white/10 rounded-xl p-3 text-white placeholder:text-white/30 outline-none focus:border-cyan-500/50 transition-colors" placeholder="Enter your 15-digit WABA ID" />
                     </div>
                     
                     <div className="p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-xl flex items-start gap-2 text-sm text-cyan-400/90 mt-2">
                         <span>💡</span>
                         <p>Tip: You can find your Phone Number ID and WABA ID inside your Meta Developer Portal under WhatsApp &gt; API Setup.</p>
                     </div>

                     <div className="flex flex-col gap-1.5 mt-4">
                        <div className="flex items-center justify-between">
                           <label className="text-sm text-white/70">Webhook URL</label>
                           <button onClick={() => setShowSetupModal(true)} className="flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 transition-colors font-medium">
                              <HelpCircle size={14} />
                              <span>Setup Guide</span>
                           </button>
                        </div>
                        <input type="text" readOnly value={`${backendUrl}/webhook`} className="w-full bg-black/50 border border-white/10 rounded-xl p-3 text-white/50 outline-none cursor-not-allowed" />
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
                        <input type="text" readOnly value={backendUrl} className="w-full bg-black/50 border border-white/10 rounded-xl p-3 text-white/50 outline-none cursor-not-allowed" placeholder="https://your-app.onrender.com" />
                     </div>
                  </div>
               </div>

               
               <VipSetupBanner />
            </div>
          )}

          {activeTab === 'billing' && (
            <div className="p-8 font-sans max-w-6xl mx-auto">
               <div className="mb-10 text-center">
                  <h2 className="text-3xl font-bold tracking-tight text-white flex items-center justify-center gap-3">
                     <CreditCard className="text-cyan-400" size={32} />
                     Pricing Plans
                  </h2>
                  <p className="text-sm text-white/50 mt-3 max-w-xl mx-auto">
                     Choose the perfect plan to scale your WhatsApp marketing and automation. Manage your subscription, view active plans, and request expert setup assistance.
                  </p>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
                  {/* Starter Plan */}
                  <div className="bg-black/45 border border-white/10 rounded-3xl p-8 backdrop-blur-md flex flex-col relative transition-all duration-300 hover:border-white/20">
                     <div className="mb-8">
                        <h3 className="text-xl font-medium text-white/80 mb-2">Starter</h3>
                        <div className="text-4xl font-bold text-white flex items-baseline gap-1">
                           <span className="text-2xl text-white/50">₹</span>499
                           <span className="text-sm font-medium text-white/40 mb-1 ml-1">/ mo</span>
                        </div>
                     </div>
                     <ul className="space-y-4 mb-8 flex-1">
                        <li className="flex items-start gap-3 text-sm text-white/70"><Check size={18} className="text-emerald-400 shrink-0 mt-0.5" /> <span><strong className="text-white">AI Auto-Replies</strong> (Up to 500 chats/mo)</span></li>
                        <li className="flex items-start gap-3 text-sm text-white/70"><Check size={18} className="text-emerald-400 shrink-0 mt-0.5" /> <span>Shared Inbox</span></li>
                        <li className="flex items-start gap-3 text-sm text-white/70"><Check size={18} className="text-emerald-400 shrink-0 mt-0.5" /> <span>Basic Leads Management</span></li>
                        <li className="flex items-start gap-3 text-sm text-white/70"><Check size={18} className="text-emerald-400 shrink-0 mt-0.5" /> <span>Manual Meta API Setup</span></li>
                     </ul>
                     <button 
                        onClick={() => handleRazorpayCheckout('Starter Plan', 499)}
                        className="w-full py-3.5 bg-white/10 hover:bg-white/15 text-white font-semibold rounded-xl border border-white/10 transition-all flex items-center justify-center gap-2"
                     >
                        Choose Starter
                     </button>
                  </div>

                  {/* Pro Plan (Most Popular) */}
                  <div className="bg-black/60 border border-cyan-500/50 rounded-3xl p-8 backdrop-blur-md flex flex-col relative transform scale-105 shadow-[0_0_40px_rgba(6,182,212,0.15)] z-10 transition-all duration-300 hover:shadow-[0_0_60px_rgba(6,182,212,0.25)]">
                     <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2">
                        <span className="bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-[10px] font-bold uppercase tracking-widest py-1 px-4 rounded-full shadow-[0_0_20px_rgba(6,182,212,0.5)] border border-cyan-400/30">
                           Most Popular
                        </span>
                     </div>
                     <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-cyan-500 to-blue-500 rounded-t-3xl shadow-[0_0_15px_rgba(6,182,212,0.8)]" />
                     <div className="mb-8 mt-2">
                        <h3 className="text-xl font-medium text-cyan-400 mb-2">Pro</h3>
                        <div className="text-4xl font-bold text-white flex items-baseline gap-1">
                           <span className="text-2xl text-white/50">₹</span>999
                           <span className="text-sm font-medium text-white/40 mb-1 ml-1">/ mo</span>
                        </div>
                     </div>
                     <ul className="space-y-4 mb-8 flex-1">
                        <li className="flex items-start gap-3 text-sm text-white/80"><Check size={18} className="text-cyan-400 shrink-0 mt-0.5" /> <span><strong className="text-white">Unlimited</strong> AI Auto-Replies</span></li>
                        <li className="flex items-start gap-3 text-sm text-white/80"><Check size={18} className="text-cyan-400 shrink-0 mt-0.5" /> <span>Complete Webhook & Meta Connection</span></li>
                        <li className="flex items-start gap-3 text-sm text-white/80"><Check size={18} className="text-cyan-400 shrink-0 mt-0.5" /> <span>WhatsApp Template Suite (Bulk Sending)</span></li>
                        <li className="flex items-start gap-3 text-sm text-white/80"><Check size={18} className="text-cyan-400 shrink-0 mt-0.5" /> <span>24/7 Priority Support</span></li>
                     </ul>
                     <button 
                        onClick={() => handleRazorpayCheckout('Pro Plan', 999, 'rzp_live_SmYI9h1s1WboEw')}
                        className="w-full py-4 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold rounded-xl hover:from-cyan-400 hover:to-blue-400 transition-all flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(6,182,212,0.4)]"
                     >
                        Upgrade to Pro 🚀
                     </button>
                  </div>

                  {/* Enterprise Plan */}
                  <div className="bg-black/45 border border-white/10 rounded-3xl p-8 backdrop-blur-md flex flex-col relative transition-all duration-300 hover:border-white/20">
                     <div className="mb-8">
                        <h3 className="text-xl font-medium text-[#25D366] mb-2">Enterprise</h3>
                        <div className="text-4xl font-bold text-white flex items-baseline gap-1">
                           <span className="text-2xl text-white/50">₹</span>2,499
                           <span className="text-sm font-medium text-white/40 mb-1 ml-1">/ mo</span>
                        </div>
                     </div>
                     <ul className="space-y-4 mb-8 flex-1">
                        <li className="flex items-start gap-3 text-sm text-white/70"><Check size={18} className="text-[#25D366] shrink-0 mt-0.5" /> <span><strong className="text-white">All Pro Features Included</strong></span></li>
                        <li className="flex items-start gap-3 text-sm text-white/70"><Check size={18} className="text-[#25D366] shrink-0 mt-0.5" /> <span>100% White-Glove Custom Setup by our Engineer</span></li>
                        <li className="flex items-start gap-3 text-sm text-white/70"><Check size={18} className="text-[#25D366] shrink-0 mt-0.5" /> <span>Dedicated Account Manager</span></li>
                        <li className="flex items-start gap-3 text-sm text-white/70"><Check size={18} className="text-[#25D366] shrink-0 mt-0.5" /> <span>Priority Tech Support</span></li>
                     </ul>
                     <button 
                        onClick={() => handleRazorpayCheckout('Enterprise Plan', 2499)}
                        className="w-full py-3.5 bg-white/10 hover:bg-white/15 text-white font-semibold rounded-xl border border-white/10 transition-all flex items-center justify-center gap-2"
                     >
                        Get Enterprise
                     </button>
                  </div>
               </div>

               {/* Setup Help Banner */}
               <div className="bg-gradient-to-r from-[#25D366]/10 to-transparent border border-[#25D366]/20 rounded-3xl p-8 relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-6">
                  <div className="absolute -right-20 -top-20 w-64 h-64 bg-[#25D366]/5 rounded-full blur-3xl"></div>
                  <div className="max-w-2xl relative z-10">
                     <h3 className="text-xl font-semibold text-white mb-2 flex items-center gap-2">
                        Need Help with Setup?
                     </h3>
                     <p className="text-sm text-white/70 leading-relaxed">
                        Facing issues with configuration? Get 100% manual setup done by our Deployment Engineer for a one-time premium fee.
                     </p>
                  </div>
                  <a
                     href="https://wa.me/917065162279"
                     target="_blank"
                     rel="noopener noreferrer"
                     className="relative z-10 flex shrink-0 items-center gap-2 px-6 py-4 bg-[#25D366]/10 hover:bg-[#25D366]/20 text-[#25D366] border border-[#25D366]/30 rounded-2xl transition-all shadow-[0_0_15px_rgba(37,211,102,0.15)] hover:shadow-[0_0_25px_rgba(37,211,102,0.3)] font-semibold"
                  >
                     <MessageSquare size={20} />
                     Click to chat on WhatsApp: +91 7065162279
                  </a>
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
                  <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-220px)] custom-scrollbar">
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
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                 
                 {/* Left Panel: Recent Leads */}
                 <div className="md:col-span-12 xl:col-span-8 bg-black/40 border border-white/10 rounded-3xl p-6 flex flex-col backdrop-blur-md">
                    <h3 className="text-lg font-medium mb-6 flex items-center gap-2">
                      <Users size={18} className="text-cyan-400" />
                      Recent High-Value Leads
                    </h3>
                    <div className="flex-1 overflow-y-auto max-h-[calc(100vh-120px)] custom-scrollbar pr-2 space-y-3">
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

              </div>
            </div>
          )}
          </div>

          {/* Right Pipeline (Right) */}
          <div className="lg:col-span-4 min-w-0 order-1 lg:order-2 flex flex-col h-[600px] lg:h-[calc(100vh-120px)] w-full relative">
                 <div className="flex-1 bg-black/60 border border-cyan-500/30 rounded-3xl p-6 flex flex-col backdrop-blur-xl relative overflow-hidden shadow-[0_0_30px_rgba(6,182,212,0.05)]">
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
                    
                    <div className="flex-1 overflow-y-auto max-h-[calc(100vh-220px)] custom-scrollbar space-y-4 pr-2 z-10 flex flex-col">
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

