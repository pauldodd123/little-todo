import {encode64,decode64} from './client/crypto.js';
export function transferLink(address,recovery,app){
  const url=new URL(address);
  if(!['https:','http:'].includes(url.protocol))throw new Error('Transfer requires a web address.');
  url.hash='vcs-connect='+encode64(new TextEncoder().encode(JSON.stringify({...recovery,app})));
  return url.href;
}
export function parseTransfer(fragment){
  if(!fragment.startsWith('#vcs-connect='))return null;
  const encoded=fragment.slice(13);
  if(encoded.length>4096)throw new Error('Invalid transfer link.');
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(decode64(encoded)));
}
