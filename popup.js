const supported = new Set(["chatgpt.com","chat.openai.com","claude.ai","gemini.google.com","copilot.microsoft.com","www.perplexity.ai","perplexity.ai","poe.com","grok.com","x.com","chat.deepseek.com","www.deepseek.com","you.com","chat.mistral.ai","huggingface.co","www.meta.ai"]);
const enabledInput = document.querySelector("#enabled");
chrome.storage.local.get({ enabled:true, events:[] }, ({enabled,events}) => { enabledInput.checked = enabled; document.querySelector("#state").textContent=enabled?"ACTIVE":"PAUSED"; renderEvents(events); });
enabledInput.addEventListener("change", () => chrome.storage.local.set({enabled:enabledInput.checked}));
chrome.storage.onChanged.addListener((changes) => { if(changes.events) renderEvents(changes.events.newValue || []); if(changes.enabled){enabledInput.checked=changes.enabled.newValue;document.querySelector("#state").textContent=enabledInput.checked?"ACTIVE":"PAUSED";} });
function renderEvents(events){
  const recent=events.filter((event)=>Date.now()-event.time<7*86400000);
  document.querySelector("#blocked").textContent=recent.filter((e)=>e.action==="blocked").length;
  document.querySelector("#redacted").textContent=recent.filter((e)=>e.action==="redacted").length;
  document.querySelector("#scanned").textContent=recent.filter((e)=>e.action==="checked").length;
}
chrome.tabs.query({active:true,currentWindow:true},([tab])=>{
  try{const url=new URL(tab.url);const supportedSite=supported.has(url.hostname) && (url.hostname!=="x.com" || url.pathname.startsWith("/i/grok"));document.querySelector("#siteName").textContent=supportedSite?url.hostname:"Current tab";document.querySelector("#siteStatus").textContent=supportedSite?"Protected site":"Not monitored";document.querySelector("#siteDetail").textContent=supportedSite?"Prompt scans run locally. Sensitive prompts are stopped before submission.":"Protection is available on supported AI services. No other pages are inspected.";}catch{}
});
document.querySelector("#dashboard").onclick=()=>chrome.tabs.create({url:chrome.runtime.getURL("dashboard.html")});
document.querySelector("#settings").onclick=()=>chrome.runtime.openOptionsPage();
