import React, { useState } from "react";
import TabHipoteca from "./components/TabHipoteca";
import TabCheswick from "./components/TabCheswick";

export default function App() {
  const [activeTab, setActiveTab] = useState("hipoteca");
  return (
    <div style={{ minHeight:"100vh", background:"#0d1117", color:"#e2e8f0", fontFamily:"'DM Mono','Fira Code','Courier New',monospace", padding:"32px 24px", maxWidth:1240, margin:"0 auto" }}>
      <div style={{ marginBottom:28 }}>
        <div style={{ fontSize:11, letterSpacing:"0.2em", color:"#4a6580", textTransform:"uppercase", marginBottom:6 }}>Casa</div>
        <h1 style={{ fontSize:26, fontWeight:700, margin:0, background:"linear-gradient(90deg,#e88bba 0%,#7ecfe0 100%)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", letterSpacing:"-0.02em" }}>Hipoteca & Cheswick Village</h1>
      </div>
      <div style={{ display:"flex", gap:4, marginBottom:28, borderBottom:"1px solid #1e2537" }}>
        {[{id:"hipoteca",label:"Hipoteca"},{id:"cheswick",label:"Cheswick Village"}].map(({id,label})=>(
          <button key={id} onClick={()=>setActiveTab(id)} style={{ padding:"9px 20px", background:"transparent", border:"none", borderBottom:activeTab===id?"2px solid #7ecfe0":"2px solid transparent", color:activeTab===id?"#7ecfe0":"#4a6580", fontSize:12, letterSpacing:"0.08em", textTransform:"uppercase", cursor:"pointer", transition:"all 0.15s", marginBottom:-1 }}>{label}</button>
        ))}
      </div>
      {activeTab==="hipoteca" && <TabHipoteca/>}
      {activeTab==="cheswick" && <TabCheswick/>}
    </div>
  );
}
