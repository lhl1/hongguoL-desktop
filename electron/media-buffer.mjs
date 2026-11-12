import {Transform,Readable} from 'node:stream';
const MiB=1024*1024;
export function bufferProfile(aggressive=true){
 return aggressive?{mode:'aggressive',readable:32*MiB,writable:256*1024,web:4*MiB}:{mode:'standard',readable:MiB,writable:64*1024,web:256*1024};
}
// Keep bounded read-ahead independent of Chromium's small receiving queue.
// The watermarks apply backpressure; they are thresholds, not exact process RSS limits.
export function createReadAhead(profile,onBytes=()=>{}){
 const output=new Transform({readableHighWaterMark:profile.readable,writableHighWaterMark:profile.writable,transform(chunk,_encoding,done){onBytes(chunk.byteLength);done(null,chunk);}});
 const body=Readable.toWeb(output,{strategy:{highWaterMark:profile.web,size:chunk=>chunk.byteLength}});
 return {output,body};
}
