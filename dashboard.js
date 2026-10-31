const $=(selector)=>document.querySelector(selector);
let allEvents=[];
chrome.storage.local.get({events:[]},({events})=>{allEvents=events||[];render()});
chrome.storage.onChanged.addListener((changes)=>{if(changes.events){allEvents=changes.events.newValue||[];render()}});
function render(){
 const cutoff=Date.now()-7*86400000, week=allEvents.filter(e=>Number(e.time)>=cutoff);
 $('#checks').textContent=week.filter(e=>e.action==='checked').length;
 $('#blocked').textContent=week.filter(e=>e.action==='blocked').length;
 $('#redacted').textContent=week.filter(e=>e.action==='redacted').length;
 $('#signals').textContent=week.reduce((sum,e)=>sum+(e.action==='checked'?Number(e.findings)||0:0),0);
 $('#pasteReviews').textContent=week.filter(e=>['paste-held','paste-allowed-once','paste-discarded','paste-sanitized'].includes(e.action)).length;
 $('#promptThreats').textContent=week.filter(e=>['prompt-threat','paste-held'].includes(e.action)&&['high','critical'].includes(e.risk)).length;
 const query=($('#search')?.value||'').trim().toLowerCase(), risk=$('#riskFilter')?.value||'all';
 const filtered=week.filter(e=>(risk==='all'||e.risk===risk)&&(`${e.site} ${e.action} ${e.risk}`.toLowerCase().includes(query)));
 const box=$('#activity');box.replaceChildren();$('#empty').hidden=filtered.length>0;
 if(!filtered.length) $('#empty').textContent=week.length?'No events match these filters.':'No activity yet. Visit a supported AI service and try a fictional prompt.';
 for(const event of filtered.slice(0,250)){
  const row=document.createElement('div');row.className='event';
  const service=document.createElement('div'),site=document.createElement('span'),detail=document.createElement('small');site.className='site';site.textContent=event.site;detail.textContent=`${event.findings} finding${event.findings===1?'':'s'}`;service.append(site,detail);
  const action=document.createElement('span');action.textContent=String(event.action||'checked').replaceAll('-',' ').toUpperCase();
  const riskEl=document.createElement('span');riskEl.className=`risk ${event.risk}`;riskEl.textContent=String(event.risk||'low').toUpperCase();
  const time=document.createElement('time');time.textContent=new Date(event.time).toLocaleString();row.append(service,action,riskEl,time);box.append(row);
 }
}
$('#search').addEventListener('input',render);$('#riskFilter').addEventListener('change',render);
$('#export').onclick=async()=>{const {events=[]}=await chrome.storage.local.get('events');download(`shadowai-activity-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify({product:'ShadowAI Sentinel',exportedAt:new Date().toISOString(),privacyNote:'Prompt text and matched values are not stored.',events},null,2),'application/json')};
$('#exportCsv').onclick=async()=>{const {events=[]}=await chrome.storage.local.get('events');const cols=['time','site','action','risk','findings'];const csv=[cols.join(','),...events.map(e=>cols.map(k=>csvCell(k==='time'?new Date(e[k]).toISOString():e[k])).join(','))].join('\r\n');download(`shadowai-activity-${new Date().toISOString().slice(0,10)}.csv`,csv,'text/csv')};
function csvCell(value){return `"${String(value??'').replaceAll('"','""')}"`}
function download(filename,content,type){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
$('#clear').onclick=async()=>{if(confirm('Delete all locally stored ShadowAI activity? This cannot be undone.')){await chrome.storage.local.set({events:[]})}};

const policyDefaults={enabled:true,pasteProtection:true,promptFirewall:true,profile:'balanced'};
const quickEnabled=$('#quickEnabled'),quickPaste=$('#quickPaste'),quickPrompt=$('#quickPrompt'),quickProfile=$('#quickProfile');
chrome.storage.local.get(policyDefaults,s=>{quickEnabled.checked=s.enabled!==false;quickPaste.checked=s.pasteProtection!==false;quickPrompt.checked=s.promptFirewall!==false;quickProfile.value=s.profile||'balanced'});
async function saveQuick(){await chrome.storage.local.set({enabled:quickEnabled.checked,pasteProtection:quickPaste.checked,promptFirewall:quickPrompt.checked,profile:quickProfile.value});$('#policySaved').textContent='Policy saved locally';setTimeout(()=>$('#policySaved').textContent='',1800)}
[quickEnabled,quickPaste,quickPrompt,quickProfile].forEach(el=>el.addEventListener('change',saveQuick));
