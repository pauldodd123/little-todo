// MIT. Copy this module, browser-storage.mjs, and client/ into your app.
import {openBrowserStore,browserConnection} from './browser-storage.mjs';
import {transferLink,parseTransfer} from './connection-transfer.mjs';

// Transfer fragments never enter a server request. Remove ours before doing any I/O.
let incoming=null;
if(location.hash.startsWith('#vcs-connect=')) {
  const fragment=location.hash;
  history.replaceState(null,'',location.pathname+location.search);
  try { incoming=parseTransfer(fragment); }
  catch { incoming={invalid:true}; }
}

class VCSConnect extends HTMLElement {
  connectedCallback() {
    if(this.shadowRoot)return;
    const root=this.attachShadow({mode:'open'});
    root.innerHTML=`<style>
:host{display:block;font:14px/1.5 system-ui,sans-serif;color:#17382f;max-width:520px}*{box-sizing:border-box}.panel{border:1px solid #cbdcd3;border-radius:16px;background:#f5faf6;padding:16px}.top{display:flex;align-items:center;gap:9px}.dot{width:9px;height:9px;border-radius:50%;background:#879e90}.dot.on{background:#23885a}strong{flex:1}button{font:inherit;border:1px solid #c0d2c7;border-radius:8px;background:white;color:inherit;padding:8px 12px;cursor:pointer}button:disabled{opacity:.55;cursor:wait}details{margin-top:12px}summary{cursor:pointer}p{margin:9px 0;color:#4b6559}.actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}[role=status]{margin:8px 0 0}input{max-width:100%;font:inherit}dialog{border:1px solid #c0d2c7;border-radius:16px;padding:22px;max-width:min(440px,90vw);color:#17382f}dialog::backdrop{background:#132c2470}h2{font-size:20px;margin:0}small{display:block;margin-top:8px}
</style><div class="panel"><div class="top"><span class="dot"></span><strong>Storage</strong><span class="badge">Ready on first save</span></div><div role="status" aria-live="polite"></div><details><summary>Connection & recovery</summary><p>Your connection stays in this browser. Save a recovery copy before clearing browser data.</p><div class="actions"><button class="download">Save recovery file</button><button class="transfer">Connect another device</button><button class="restore">Restore connection</button></div><input type="file" accept=".json,application/json" aria-label="Choose recovery file" hidden><small>Anyone with your recovery file or private transfer link can read, change and delete this store.</small></details></div><dialog><h2>Connect another device</h2><p class="dialog-text"></p><div class="actions"><button class="confirm">Copy private link</button><button class="cancel">Cancel</button></div></dialog>`;
    this.options={name:this.getAttribute('name')||'default',endpoint:this.getAttribute('endpoint')||'https://api.vibecodestorage.com'};
    this.connection=browserConnection(this.options);
    this.status=root.querySelector('[role=status]');this.dialog=root.querySelector('dialog');
    root.querySelector('.cancel').onclick=()=>this.dialog.close();
    root.querySelector('.download').onclick=()=>this.run(async()=>{
      const recovery=await this.connection.recovery();const url=URL.createObjectURL(new Blob([JSON.stringify(recovery,null,2)],{type:'application/json'}));
      const link=document.createElement('a');link.href=url;link.download='vibecodestorage-recovery.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);this.status.textContent='Recovery file downloaded. Keep it private.';
    });
    root.querySelector('.restore').onclick=()=>root.querySelector('input').click();
    root.querySelector('input').onchange=e=>this.run(async()=>{const file=e.target.files[0];e.target.value='';if(!file)return;if(file.size>4096)throw new Error('Choose a VibeCodeStorage recovery file.');await this.accept(JSON.parse(await file.text()));});
    root.querySelector('.transfer').onclick=()=>this.run(async()=>{
      const recovery=await this.connection.recovery();
      const url=transferLink(location.href,recovery,this.options.name);
      this.prompt('This private link gives full access to your store. Send it only to your own device or someone you trust. It is reusable, not a temporary invitation.','Copy private link',async()=>{await navigator.clipboard.writeText(url);this.status.textContent='Private link copied. Open it on your other device.';});
    });
    this.refresh();
    if(incoming && !this.transferHandled){this.transferHandled=true;const payload=incoming;incoming=null;
      if(payload.invalid || payload.app!==this.options.name){this.status.textContent='This transfer link is invalid or belongs to a different app.';return;}
      this.prompt('Connect this browser to the store from the private link? Existing connections will never be replaced.','Connect this browser',()=>this.accept(payload));
    }
    this.onStorage=()=>this.refresh();window.addEventListener('storage',this.onStorage);
  }
  disconnectedCallback(){window.removeEventListener('storage',this.onStorage);}
  refresh(){try{const saved=this.connection.saved();this.shadowRoot.querySelector('.badge').textContent=saved?'Connected':'Ready on first save';this.shadowRoot.querySelector('.dot').classList.toggle('on',saved);for(const cls of ['download','transfer'])this.shadowRoot.querySelector('.'+cls).disabled=!saved;}catch{this.status.textContent='Saved connection is unreadable. Keep browser data intact and restore from a recovery copy.';}}
  async run(action){try{await action();}catch(error){this.status.textContent=error.message;}finally{this.refresh();}}
  prompt(message,label,action){this.shadowRoot.querySelector('.dialog-text').textContent=message;const button=this.shadowRoot.querySelector('.confirm');button.textContent=label;button.onclick=()=>this.run(async()=>{button.disabled=true;try{await action();this.dialog.close();}finally{button.disabled=false;}});this.dialog.showModal();}
  async accept(payload){await this.connection.restore(payload);this.status.textContent='Connection restored. Your app can now load saved data.';this.dispatchEvent(new Event('vcs-connected',{bubbles:true}));}
  // Call only from the app's first save, never merely to render the component.
  async getStore(){this.status.textContent='Connecting storage…';try{const store=await openBrowserStore(this.options);this.status.textContent='';this.refresh();return store;}catch(error){this.status.textContent=error.message;this.refresh();throw error;}}
  get connected(){try{return this.connection.saved();}catch{return false;}}
}
if(!customElements.get('vcs-connect'))customElements.define('vcs-connect',VCSConnect);
