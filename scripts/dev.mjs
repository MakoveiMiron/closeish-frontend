// Static frontend server + local API proxy. The separately started backend is not bundled.
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const upstream=new URL(process.env.API_PROXY_TARGET||'http://127.0.0.1:3000');
if(!['http:','https:'].includes(upstream.protocol))throw new Error('API_PROXY_TARGET must be HTTP(S)');
const files=new Map(fs.readdirSync(root).filter(f=>/\.(html|js|css)$/.test(f)).map(f=>['/'+f,path.join(root,f)]));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
const web=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/api/')||['/healthz','/readyz'].includes(url.pathname)){
  const transport=upstream.protocol==='https:'?https:http;
  const proxy=transport.request(new URL(url.pathname+url.search,upstream),{method:req.method,headers:{...req.headers,host:upstream.host}},reply=>{res.writeHead(reply.statusCode,reply.headers);reply.pipe(res)});
  proxy.setTimeout(15000,()=>proxy.destroy(new Error('Upstream timeout')));
  proxy.on('error',()=>{if(!res.headersSent){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{code:'API_UNAVAILABLE',message:'Start the separate backend, or configure API_PROXY_TARGET.'}}))}else res.destroy()});
  req.pipe(proxy);return;
 }
 const file=files.get(url.pathname==='/'?'/index.html':url.pathname);
 if(!file){res.writeHead(404);res.end('Not found');return}
 res.writeHead(200,{'Content-Type':types[path.extname(file)],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});fs.createReadStream(file).pipe(res);
});
const port=Number(process.env.WEB_PORT||5173),host=process.env.WEB_HOST||'127.0.0.1';
web.listen(port,host,()=>console.log(`CLOSEISH frontend http://${host}:${port} | API proxy ${upstream.origin}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{web.close();web.closeAllConnections()});
