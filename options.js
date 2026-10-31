const $ = (s) => document.querySelector(s);
const enabled=$('#enabled'), strict=$('#strict'), approved=$('#approved'), threshold=$('#threshold'), retention=$('#retention'), saved=$('#saved'), pasteProtection=$('#pasteProtection'), promptFirewall=$('#promptFirewall'), profile=$('#profile');
const DEFAULTS={enabled:true,strictMode:false,approvedHosts:['chatgpt.com','claude.ai','gemini.google.com'],blockSeverity:'high',retentionDays:30,pasteProtection:true,promptFirewall:true,profile:'balanced'};
chrome.storage.local.get(DEFAULTS,(s)=>{enabled.checked=s.enabled;strict.checked=s.strictMode;approved.value=(s.approvedHosts||[]).join('\n');threshold.value=s.blockSeverity||'high';retention.value=String(s.retentionDays||30);pasteProtection.checked=s.pasteProtection!==false;promptFirewall.checked=s.promptFirewall!==false;profile.value=s.profile||'balanced'});
$('#save').onclick=async()=>{
 const hosts=[...new Set(approved.value.split(/[\n,\s]+/).map(h=>h.trim().toLowerCase().replace(/^https?:\/\//,'').replace(/\/$/,'')).filter(h=>/^(?:[a-z0-9-]+\.)*[a-z0-9-]+\.[a-z]{2,}$/.test(h)))];
 await chrome.storage.local.set({enabled:enabled.checked,strictMode:strict.checked,approvedHosts:hosts,blockSeverity:threshold.value,retentionDays:Number(retention.value),pasteProtection:pasteProtection.checked,promptFirewall:promptFirewall.checked,profile:profile.value});
 saved.textContent=`Saved locally · ${hosts.length} approved host(s)`;setTimeout(()=>saved.textContent='',3000);
};
