import React from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, CheckCircle2, MessageSquareText, ShieldCheck, Zap, Phone, ArrowUpRight } from 'lucide-react';

export default function Enterprise() {
  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100 p-4 px-8 flex items-center justify-between">
        <div className="flex items-center gap-2">
           <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center text-white font-bold text-lg">DDX</div>
           <span className="font-semibold tracking-wide text-gray-800">Enterprise Managed Services</span>
        </div>
        <a href="/" className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-black transition-colors">
          <ArrowLeft size={16} /> Back to Platform
        </a>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-8 max-w-7xl mx-auto flex flex-col items-center text-center">
        {/* Subtle Background Grid Accent */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden flex justify-center -z-10">
           <div className="w-[800px] h-full bg-[linear-gradient(to_right,#f0f0f0_1px,transparent_1px),linear-gradient(to_bottom,#f0f0f0_1px,transparent_1px)] bg-[size:40px_40px] opacity-40"></div>
           <div className="absolute top-0 w-full h-[300px] bg-gradient-to-b from-white to-transparent" />
        </div>
        
        <motion.div 
           initial={{ opacity: 0, y: 20 }}
           animate={{ opacity: 1, y: 0 }}
           transition={{ duration: 0.6 }}
           className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-50 border border-blue-100 text-blue-700 text-sm font-semibold mb-8"
        >
           <ShieldCheck size={16} /> Premium "Done-For-You" Solution
        </motion.div>
        
        <motion.h1 
           initial={{ opacity: 0, y: 20 }}
           animate={{ opacity: 1, y: 0 }}
           transition={{ duration: 0.6, delay: 0.1 }}
           className="text-5xl md:text-6xl font-extrabold tracking-tight text-gray-900 leading-tight mb-6 max-w-4xl"
        >
          We Architect, Deploy & Manage Your Entire Business Automation Ecosystem
        </motion.h1>
        
        <motion.p 
           initial={{ opacity: 0, y: 20 }}
           animate={{ opacity: 1, y: 0 }}
           transition={{ duration: 0.6, delay: 0.2 }}
           className="text-lg md:text-xl text-gray-500 max-w-2xl mb-10 leading-relaxed"
        >
          Zero technical overhead for your team. We take over the complexities of AI integrations, API management, and workflow automation so you can focus purely on scaling your enterprise operations.
        </motion.p>
      </section>

      {/* 3-Step Operations Model */}
      <section className="py-20 px-8 bg-gray-50 border-y border-gray-100">
         <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
               <h2 className="text-3xl font-bold text-gray-900 mb-4">Our "Done-For-You" Model</h2>
               <p className="text-gray-500 max-w-2xl mx-auto">You don't need to configure anything. We build it, we run it, we maintain it daily. Custom enterprise pricing ranges from ₹20,000 to ₹30,000/month depending on business volume.</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
               {[
                  {
                     icon: <Zap className="text-blue-600" size={24} />,
                     title: "1. Architect & Build",
                     desc: "Full-Scale Workflow Design including custom Webhooks, Google Sheets live sync, and internal Database integrations mapped to your operations."
                  },
                  {
                     icon: <ShieldCheck className="text-green-600" size={24} />,
                     title: "2. Compliance & Deployment",
                     desc: "Complete Meta Cloud API setup, Official WhatsApp Business registration, and end-to-end Meta Green Tick Verification assistance."
                  },
                  {
                     icon: <MessageSquareText className="text-indigo-600" size={24} />,
                     title: "3. Manage & Optimize",
                     desc: "Dedicated Tech Support Staff running daily operations maintenance, continuous conversational optimization, and real-time troubleshooting."
                  }
               ].map((step, i) => (
                  <motion.div 
                     key={i}
                     initial={{ opacity: 0, y: 20 }}
                     whileInView={{ opacity: 1, y: 0 }}
                     viewport={{ once: true }}
                     transition={{ duration: 0.5, delay: i * 0.1 }}
                     whileHover={{ scale: 1.02 }}
                     className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm transition-shadow hover:shadow-lg"
                  >
                     <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center mb-6">
                        {step.icon}
                     </div>
                     <h3 className="text-xl font-bold text-gray-900 mb-3">{step.title}</h3>
                     <p className="text-gray-500 leading-relaxed text-sm">{step.desc}</p>
                  </motion.div>
               ))}
            </div>
         </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-8 max-w-7xl mx-auto">
         <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            {/* Live AI Demo */}
            <motion.div 
               initial={{ opacity: 0, x: -30 }}
               whileInView={{ opacity: 1, x: 0 }}
               viewport={{ once: true }}
               className="bg-gray-900 text-white p-10 rounded-[40px] shadow-2xl relative overflow-hidden"
            >
               <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl" />
               <div className="relative z-10">
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 text-blue-300 text-xs font-semibold mb-6 border border-white/10">
                     <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" /> Live Now
                  </div>
                  <h3 className="text-3xl font-bold mb-4">Experience the AI</h3>
                  <p className="text-gray-400 mb-8 max-w-sm">Scan or click this demo number to experience how our AI manages inbound inquiries on autopilot right now.</p>
                  
                  <div className="bg-white/5 border border-white/10 p-6 rounded-2xl flex flex-col gap-2">
                     <span className="text-sm font-medium text-gray-400 uppercase tracking-wider">Demo Number</span>
                     <a href="https://wa.me/918796505884" target="_blank" rel="noreferrer" className="text-3xl font-bold text-white hover:text-blue-400 transition-colors flex items-center gap-3">
                        +91 87965 05884 <ArrowUpRight size={24} className="text-gray-500" />
                     </a>
                  </div>
               </div>
            </motion.div>

            {/* Direct Consultation */}
            <motion.div 
               initial={{ opacity: 0, x: 30 }}
               whileInView={{ opacity: 1, x: 0 }}
               viewport={{ once: true }}
               className="flex flex-col gap-6"
            >
               <h3 className="text-3xl font-bold text-gray-900 leading-tight">Ready to hand over the tech burden?</h3>
               <p className="text-gray-500 text-lg">Connect directly with our Enterprise deployment team to discuss your current infrastructure and how we can migrate you to a zero-touch automated ecosystem.</p>
               
               <a 
                  href="https://wa.me/917065162279?text=Hello%20DDX%20Team,%20I%20want%20to%20discuss%20the%20Enterprise%20Managed%20Service%20for%20my%20business."
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 bg-black hover:bg-gray-800 text-white px-8 py-5 rounded-2xl font-semibold flex items-center justify-center gap-3 transition-transform hover:scale-[1.02] active:scale-[0.98] shadow-xl shadow-black/10 text-lg"
               >
                  <Phone size={20} />
                  Schedule Enterprise Consultation
               </a>
               <p className="text-sm text-gray-400 text-center font-medium mt-2">
                  Official Corporate WhatsApp: +91 7065162279
               </p>
            </motion.div>
         </div>
      </section>
      
      {/* Footer */}
      <footer className="py-8 text-center text-gray-400 text-sm border-t border-gray-100">
         Premium Enterprise Managed Services &copy; {new Date().getFullYear()} DDX Platform. All Rights Reserved.
      </footer>
    </div>
  );
}
