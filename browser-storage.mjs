// Serve this module and client/{sdk,crypto}.js on your own HTTPS origin.
// Each browser profile gets its own private store. Never publish credentials.
import { VibeCodeStorage } from './client/sdk.js';
export async function openBrowserStore({name='default',endpoint='https://api.vibecodestorage.com'}={}) {
  if(!globalThis.isSecureContext || !navigator.locks) throw new Error('Storage requires HTTPS or localhost and Web Locks support.');
  const key='vibecodestorage:'+endpoint+':'+name;
  return navigator.locks.request(key, async()=>{
    let state=JSON.parse(localStorage.getItem(key)||'null');
    if(state?.credentials) return new VibeCodeStorage(state.credentials);
    if(!state){state={creationRequest:VibeCodeStorage.createRequest({endpoint})};localStorage.setItem(key,JSON.stringify(state));}
    if(state.retryAt && Date.now()<Date.parse(state.retryAt)) throw new Error('Store setup is waiting until '+state.retryAt+'. No background retry is running.');
    // Persist the request and encryption key BEFORE networking. Tabs share this lock.
    const response=await fetch(endpoint+'/v1/stores',{method:'POST',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json','Idempotency-Key':state.creationRequest.requestId},body:'{}'});
    const data=await response.json();
    if(!response.ok){if(data.error?.retryAt){state.retryAt=data.error.retryAt;localStorage.setItem(key,JSON.stringify(state));}throw new Error(data.error?.message||'Storage setup failed. Keep saved setup state and try again later.');}
    const credentials={endpoint,storeId:data.storeId,accessToken:data.accessToken,encryptionKey:state.creationRequest.encryptionKey};
    localStorage.setItem(key,JSON.stringify({credentials}));
    return new VibeCodeStorage(credentials);
  });
}

// Connection management shares the same lock and storage namespace as provisioning.
export function browserConnection({name='default',endpoint='https://api.vibecodestorage.com'}={}) {
  const key='vibecodestorage:'+endpoint+':'+name;
  return {
    saved() { const state=JSON.parse(localStorage.getItem(key)||'null'); return Boolean(state?.credentials); },
    async recovery() {
      const state=JSON.parse(localStorage.getItem(key)||'null');
      if(!state?.credentials) throw new Error('Save something first, or restore an existing connection.');
      return {format:'vibecodestorage/connection-v1',credentials:state.credentials};
    },
    async restore(input) {
      const credentials=input?.format==='vibecodestorage/connection-v1' ? input.credentials : input;
      if(credentials?.endpoint!==endpoint) throw new Error('This recovery file belongs to a different storage service.');
      if(!/^[A-Za-z0-9_-]{43}$/.test(credentials?.accessToken||'')) throw new Error('Invalid recovery credentials.');
      const store=new VibeCodeStorage(credentials);await store.keys;
      // Verify possession before changing saved state. Never provision during recovery.
      await store.info();
      return navigator.locks.request(key,async()=>{
        const current=JSON.parse(localStorage.getItem(key)||'null');
        if(current?.creationRequest) throw new Error('Setup is pending in this browser. Keep that connection; use a separate browser profile to restore another store.');
        if(current?.credentials && (current.credentials.storeId!==credentials.storeId || current.credentials.accessToken!==credentials.accessToken || current.credentials.encryptionKey!==credentials.encryptionKey)) throw new Error('This app already has a different connection. It has not been replaced.');
        localStorage.setItem(key,JSON.stringify({credentials:store.credentials}));return store;
      });
    }
  };
}
