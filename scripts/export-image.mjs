import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { createHash } from 'node:crypto';

const image=process.argv[2],file=process.argv[3];
if(!image || !file?.endsWith('.tar.gz'))throw Error('Usage: node scripts/export-image.mjs IMAGE OUTPUT.tar.gz');
fs.mkdirSync(path.dirname(path.resolve(file)),{recursive:true});
const child=spawn('docker',['save',image],{stdio:['ignore','pipe','inherit']});
const exited=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error(`docker save: ${code}`)));});
await Promise.all([pipeline(child.stdout,createGzip(),fs.createWriteStream(file,{flags:'wx'})),exited]);
const hash=createHash('sha256');
for await(const chunk of fs.createReadStream(file))hash.update(chunk);
const checksum=hash.digest('hex');
fs.writeFileSync(file+'.sha256',`${checksum}  ${path.basename(file)}\n`,{flag:'wx'});
console.log(JSON.stringify({image,file,sha256:checksum,bytes:fs.statSync(file).size}));
