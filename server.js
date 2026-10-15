// Watch Party server: authoritative room state over WebSocket. Run: npm i && npm start
const http=require('http'),fs=require('fs'),path=require('path'),{WebSocketServer}=require('ws');
const rooms=new Map(),MAX_USERS=50,GRACE=30000;
const server=http.createServer((q,s)=>{
  const f=path.join(__dirname,'public','index.html');
  s.writeHead(200,{'Content-Type':'text/html'});fs.createReadStream(f).pipe(s);
});
const wss=new WebSocketServer({server});
const uid=()=>Math.random().toString(36).slice(2,10);
const newCode=()=>{let c;do c=Math.random().toString(36).slice(2,8).toUpperCase();while(rooms.has(c));return c};
const raw=(w,s)=>w&&w.readyState===1&&w.send(s);
const bcast=(r,m)=>{const s=JSON.stringify(m);for(const u of r.users.values())raw(u.ws,s)};
const snap=r=>({t:'room',code:r.code,host:r.host,
  users:[...r.users.values()].map(u=>({id:u.id,name:u.name,on:!!u.ws})),
  playlist:r.playlist,polls:r.polls,video:r.video,chat:r.chat.slice(-50)});
const pushRoom=r=>bcast(r,snap(r));
function leave(r,u){ // remove member after grace period; transfer host if needed
  r.users.delete(u.id);
  if(r.host===u.id){const n=[...r.users.values()].find(x=>x.ws)||[...r.users.values()][0];r.host=n?n.id:null}
  if(!r.users.size)rooms.delete(r.code);else pushRoom(r);
}
wss.on('connection',ws=>{
  let r=null,u=null;
  ws.on('message',d=>{
    let m;try{m=JSON.parse(d)}catch{return}
    if(m.t==='ping')return raw(ws,JSON.stringify({t:'pong',c:m.c,s:Date.now()}));
    if(m.t==='join'){
      r=m.create?null:rooms.get((m.room||'').toUpperCase());
      if(m.create){r={code:newCode(),host:m.id,users:new Map(),playlist:[],polls:[],chat:[],
        video:{url:'',title:'',playing:false,pos:0,at:Date.now(),v:0}};rooms.set(r.code,r)}
      if(!r)return raw(ws,JSON.stringify({t:'err',msg:'Room not found'}));
      u=r.users.get(m.id);
      if(!u){if(r.users.size>=MAX_USERS)return raw(ws,JSON.stringify({t:'err',msg:'Room full'}));u={id:m.id,name:m.name||'Guest'};r.users.set(u.id,u)}
      clearTimeout(u.timer);if(u.ws&&u.ws!==ws)u.ws.close();
      u.ws=ws;u.name=m.name||u.name;if(!r.host)r.host=u.id;
      return pushRoom(r); // late join / reconnect: full snapshot incl. current video state
    }
    if(!r||!u)return;
    const v=r.video,now=Date.now();
    switch(m.t){
      case'ctl': // server order = canonical order; last writer wins, every change bumps v
        if(m.op==='load'){if(r.host!==u.id)return;Object.assign(v,{url:m.url,title:m.title||'',pos:0,playing:true,at:now})}
        else if(m.op==='play')Object.assign(v,{playing:true,pos:+m.pos||0,at:now});
        else if(m.op==='pause')Object.assign(v,{playing:false,pos:+m.pos||0,at:now});
        else if(m.op==='seek')Object.assign(v,{pos:+m.pos||0,at:now});
        else return;
        v.v++;return bcast(r,{t:'state',video:v,by:u.id,c:m.c});
      case'chat':{const c={id:uid(),from:u.name,text:String(m.text).slice(0,500)};r.chat.push(c);if(r.chat.length>200)r.chat.shift();return bcast(r,{t:'chat',...c})}
      case'react':return bcast(r,{t:'react',emoji:String(m.emoji).slice(0,8),from:u.name});
      case'pl':
        if(m.op==='add')r.playlist.push({id:uid(),url:m.url,title:m.title,by:u.name});
        else if(m.op==='remove')r.playlist=r.playlist.filter(x=>x.id!==m.id);
        else if(m.op==='next'&&r.host===u.id){const n=r.playlist.shift();if(n){Object.assign(v,{url:n.url,title:n.title,pos:0,playing:true,at:now});v.v++}}
        return pushRoom(r);
      case'poll':
        if(m.op==='create')r.polls.push({id:uid(),q:String(m.q).slice(0,200),opts:m.opts.slice(0,6).map(String),votes:{},open:true,by:u.id});
        else{const p=r.polls.find(x=>x.id===m.pid);if(!p)return;
          if(m.op==='vote'&&p.open&&p.opts[m.i]!==undefined)p.votes[u.id]=m.i; // one vote each, changeable
          if(m.op==='close'&&(p.by===u.id||r.host===u.id))p.open=false}
        return pushRoom(r);
      case'host':if(r.host===u.id&&r.users.has(m.to)){r.host=m.to;pushRoom(r)}
    }
  });
  ws.on('close',()=>{
    if(!r||!u||u.ws!==ws)return;u.ws=null;
    if(r.host===u.id){const n=[...r.users.values()].find(x=>x.ws);if(n)r.host=n.id} // immediate host failover
    pushRoom(r);u.timer=setTimeout(()=>leave(r,u),GRACE);
  });
});
server.listen(process.env.PORT||3000,()=>console.log('http://localhost:'+(process.env.PORT||3000)));
